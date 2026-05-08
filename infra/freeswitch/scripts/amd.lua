--[[
  Voxora AMD (Answering Machine Detection) Script
  
  Triggered via execute_on_answer channel variable.
  Runs AFTER the call is answered.

  Reads channel variables:
    voxora_campaign_id      — Campaign UUID
    voxora_call_log_id      — CallLog UUID
    voxora_audio_file       — Absolute path to main audio (shared volume /app/uploads/...)
    voxora_voicemail_audio  — Absolute path to voicemail audio
    voxora_amd_action       — PLAY_ON_HUMAN | VOICEMAIL_DROP | HANGUP_ON_MACHINE | PLAY_ON_BOTH

  AMD detection strategy:
    1. Check for FreeSWITCH native AMD (mod_spandsp AMD) if available
    2. Fallback: check tone length variable (>0 = machine left a tone)
    3. Fallback: assume HUMAN (safest default)
--]]

-- ── Read channel variables ─────────────────────────────────────────────────
local campaign_id = session:getVariable("voxora_campaign_id")  or ""
local call_log_id = session:getVariable("voxora_call_log_id")  or ""
local call_uuid   = session:getVariable("uuid")                 or ""
local audio_file  = session:getVariable("voxora_audio_file")   or ""
local vm_audio    = session:getVariable("voxora_voicemail_audio") or ""
local amd_action  = session:getVariable("voxora_amd_action")   or "PLAY_ON_HUMAN"

freeswitch.consoleLog("INFO",
  string.format("[Voxora AMD] uuid=%s campaign=%s log=%s action=%s\n",
    call_uuid, campaign_id, call_log_id, amd_action))

-- ── Helper: fire custom ESL event (picked up by FreeswitchEslService) ──────
local function fire(event_type, data)
  local e = freeswitch.Event("CUSTOM", "voxora::" .. event_type)
  e:addHeader("campaign_id", campaign_id)
  e:addHeader("call_log_id", call_log_id)
  e:addHeader("call_uuid",   call_uuid)
  for k, v in pairs(data) do
    e:addHeader(k, tostring(v))
  end
  e:fire()
end

-- ── Helper: safe audio playback ─────────────────────────────────────────────
local function play(file_path)
  if not session:ready()          then return false end
  if not file_path or file_path == "" then return false end
  
  -- Verify file exists (FreeSWITCH will error silently if missing)
  local f = io.open(file_path, "r")
  if not f then
    freeswitch.consoleLog("WARNING",
      string.format("[Voxora AMD] Audio file not found: %s\n", file_path))
    return false
  end
  f:close()

  freeswitch.consoleLog("INFO",
    string.format("[Voxora AMD] Playing: %s\n", file_path))
  session:execute("playback", file_path)
  return true
end

-- ── Helper: wait for voicemail beep ─────────────────────────────────────────
local function wait_for_beep(max_wait_ms)
  -- Listen for a tone between 400-500Hz (typical voicemail beep)
  -- Using silence detection as proxy: wait up to max_wait_ms ms
  session:execute("sleep", tostring(math.min(max_wait_ms, 4000)))
end

-- ── AMD Detection ────────────────────────────────────────────────────────────
if not session:ready() then
  freeswitch.consoleLog("WARNING", "[Voxora AMD] Session not ready, exiting\n")
  return
end

local amd_result  = "HUMAN"   -- Default: assume human
local amd_tone_ms = 0

-- Method 1: Check if mod_spandsp AMD ran and set the variable
local spandsp_result = session:getVariable("amd_result")
if spandsp_result then
  amd_result  = spandsp_result
  amd_tone_ms = tonumber(session:getVariable("amd_tone_length") or "0") or 0
  freeswitch.consoleLog("INFO",
    string.format("[Voxora AMD] SpanDSP result: %s (tone=%dms)\n", amd_result, amd_tone_ms))

-- Method 2: tone_length > 0 means a machine played a greeting and beeped
elseif tonumber(session:getVariable("amd_tone_length") or "0") > 0 then
  amd_tone_ms = tonumber(session:getVariable("amd_tone_length"))
  amd_result  = "MACHINE"
  freeswitch.consoleLog("INFO",
    string.format("[Voxora AMD] Tone detected: %dms → MACHINE\n", amd_tone_ms))

else
  -- Method 3: Default to HUMAN
  freeswitch.consoleLog("INFO", "[Voxora AMD] No detection signal → defaulting to HUMAN\n")
end

-- ── Act on AMD result ────────────────────────────────────────────────────────
if amd_result == "HUMAN" then
  fire("human_answer", { result = "HUMAN", tone_len = 0 })

  if amd_action == "PLAY_ON_HUMAN" or
     amd_action == "PLAY_ON_BOTH" then
    play(audio_file)

  elseif amd_action == "VOICEMAIL_DROP" then
    -- Still play main audio for human (voicemail drop only on machines)
    play(audio_file)

  elseif amd_action == "HANGUP_ON_MACHINE" then
    -- Play audio for human even when action is hangup-on-machine
    play(audio_file)
  end

elseif amd_result == "MACHINE" then
  fire("machine_answer", { result = "MACHINE", tone_len = amd_tone_ms })

  if amd_action == "VOICEMAIL_DROP" then
    -- Wait for beep if we haven't detected one yet
    if amd_tone_ms == 0 then
      freeswitch.consoleLog("INFO", "[Voxora AMD] Waiting for VM beep...\n")
      wait_for_beep(5000)
    end
    -- Drop voicemail audio, or fall back to main audio
    if not play(vm_audio) then
      play(audio_file)
    end

  elseif amd_action == "HANGUP_ON_MACHINE" then
    freeswitch.consoleLog("INFO", "[Voxora AMD] Machine detected → hanging up\n")
    session:execute("hangup", "NORMAL_CLEARING")
    return

  elseif amd_action == "PLAY_ON_BOTH" then
    play(audio_file)

  else
    -- PLAY_ON_HUMAN with machine → hang up (machine, don't waste time)
    session:execute("hangup", "NORMAL_CLEARING")
    return
  end

elseif amd_result == "FAX" then
  fire("fax_detected", { result = "FAX" })
  freeswitch.consoleLog("INFO", "[Voxora AMD] FAX detected → hanging up\n")
  session:execute("hangup", "NORMAL_CLEARING")
  return

else  -- NOTSURE
  fire("amd_uncertain", { result = "NOTSURE" })
  -- Default safe action: play audio
  if amd_action ~= "HANGUP_ON_MACHINE" then
    play(audio_file)
  end
end

-- ── Clean hangup ─────────────────────────────────────────────────────────────
if session:ready() then
  session:execute("hangup", "NORMAL_CLEARING")
end
