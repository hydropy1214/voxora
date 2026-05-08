--[[
  Voxora AMD (Answering Machine Detection) Handler
  
  Triggered after call is answered via execute_on_answer.
  Detects: HUMAN | MACHINE (voicemail) | FAX | NOTSURE
  
  Channel variables expected:
    voxora_campaign_id
    voxora_audio_file        (path to main audio for human answer)
    voxora_voicemail_audio   (path to voicemail drop audio)
    voxora_amd_action        (PLAY_ON_HUMAN|VOICEMAIL_DROP|HANGUP_ON_MACHINE|PLAY_ON_BOTH)
]]

local campaign_id  = session:getVariable("voxora_campaign_id") or ""
local call_uuid    = session:getVariable("uuid") or ""
local audio_file   = session:getVariable("voxora_audio_file") or ""
local vm_audio     = session:getVariable("voxora_voicemail_audio") or ""
local amd_action   = session:getVariable("voxora_amd_action") or "PLAY_ON_HUMAN"

-- ── Helper: fire ESL custom event ──────────────────────────────────────────
local function fire_event(event_type, data)
  local e = freeswitch.Event("CUSTOM", "voxora::" .. event_type)
  e:addHeader("campaign_id",  campaign_id)
  e:addHeader("call_uuid",    call_uuid)
  for k, v in pairs(data) do
    e:addHeader(k, tostring(v))
  end
  e:fire()
end

-- ── Helper: safe playback ──────────────────────────────────────────────────
local function play(file)
  if not session:ready() then return false end
  if file == "" or file == nil then return false end
  -- Support both local paths and HTTP URLs
  if file:sub(1,4) == "http" then
    session:execute("playback", "shout://" .. file)
  else
    session:execute("playback", file)
  end
  return true
end

-- ── Helper: wait for beep after answering machine greeting ────────────────
local function wait_for_beep(timeout_ms)
  timeout_ms = timeout_ms or 5000
  -- Use SpanDSP tone detection to find 440Hz + 480Hz beep
  -- This is a simplified approach; production would use mod_spandsp AMD
  session:execute("sleep", tostring(math.min(timeout_ms, 3000)))
end

-- ── Main AMD detection using SpanDSP ──────────────────────────────────────
freeswitch.consoleLog("INFO", string.format(
  "[Voxora AMD] Starting detection | UUID=%s CampaignID=%s Action=%s\n",
  call_uuid, campaign_id, amd_action
))

if not session:ready() then
  freeswitch.consoleLog("WARNING", "[Voxora AMD] Session not ready, exiting\n")
  return
end

-- Detect AMD via SpanDSP AMD application
local amd_result  = "NOTSURE"
local amd_tone_ms = 0

-- Run AMD detection
session:execute("spandsp_stop_dtmf")

-- Try to get AMD from channel variable (set by mod_spandsp AMD detection)
-- In production FreeSWITCH with mod_spandsp, you'd run:
--   session:execute("execute_extension", "detect_amd XML voxora_outbound")
-- For compatibility, we use a manual detection approach:

-- Check if already determined by bridge result
local answer_state = session:getVariable("answer-state") or ""
local hangup_cause = session:getVariable("hangup_cause") or ""

-- Simple detection via tone (many voicemail systems play a tone)
local tone_len = tonumber(session:getVariable("amd_tone_length") or "0")

if tone_len and tone_len > 0 then
  amd_result  = "MACHINE"
  amd_tone_ms = tone_len
elseif answer_state == "answered" then
  -- Attempt SpanDSP AMD if available
  local spandsp_result = session:getVariable("amd_result")
  if spandsp_result then
    amd_result = spandsp_result
  else
    -- Default: assume human if answered and no machine indicators
    amd_result = "HUMAN"
  end
end

freeswitch.consoleLog("INFO", string.format(
  "[Voxora AMD] Result=%s ToneLen=%dms CampaignID=%s\n",
  amd_result, amd_tone_ms, campaign_id
))

-- ── Act on AMD result ──────────────────────────────────────────────────────

if amd_result == "HUMAN" then
  fire_event("human_answer", { result = "HUMAN", tone_len = 0 })
  freeswitch.consoleLog("INFO", "[Voxora AMD] HUMAN detected → playing audio\n")

  if amd_action == "PLAY_ON_HUMAN" or amd_action == "PLAY_ON_BOTH" then
    play(audio_file)
  elseif amd_action == "VOICEMAIL_DROP" then
    -- Still play main audio for human, voicemail drop only on machine
    play(audio_file)
  elseif amd_action == "HANGUP_ON_MACHINE" then
    play(audio_file)
  end

elseif amd_result == "MACHINE" then
  fire_event("machine_answer", {
    result   = "MACHINE",
    tone_len = amd_tone_ms
  })
  freeswitch.consoleLog("INFO", string.format(
    "[Voxora AMD] MACHINE detected (tone=%dms) → action=%s\n",
    amd_tone_ms, amd_action
  ))

  if amd_action == "VOICEMAIL_DROP" then
    -- Wait for beep if not already heard
    if amd_tone_ms == 0 then
      freeswitch.consoleLog("INFO", "[Voxora AMD] Waiting for voicemail beep...\n")
      wait_for_beep(5000)
    end
    play(vm_audio ~= "" and vm_audio or audio_file)

  elseif amd_action == "HANGUP_ON_MACHINE" then
    freeswitch.consoleLog("INFO", "[Voxora AMD] Hanging up on machine\n")
    session:execute("hangup", "NORMAL_CLEARING")
    return

  elseif amd_action == "PLAY_ON_BOTH" then
    play(audio_file)

  else
    -- Default: hangup on machine for PLAY_ON_HUMAN action
    session:execute("hangup", "NORMAL_CLEARING")
    return
  end

elseif amd_result == "FAX" then
  fire_event("fax_detected", { result = "FAX" })
  freeswitch.consoleLog("INFO", "[Voxora AMD] FAX detected → hanging up\n")
  session:execute("hangup", "NORMAL_CLEARING")
  return

else
  -- NOTSURE — default to playing audio
  fire_event("amd_uncertain", { result = "NOTSURE" })
  freeswitch.consoleLog("INFO", "[Voxora AMD] NOTSURE → playing audio (default)\n")
  if amd_action ~= "HANGUP_ON_MACHINE" then
    play(audio_file)
  end
end

-- Final hangup
if session:ready() then
  session:execute("hangup", "NORMAL_CLEARING")
end
