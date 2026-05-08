-- Voxora AMD (Answering Machine Detection) Handler
-- Detects human answer vs voicemail/machine

local campaign_id = session:getVariable("voxora_campaign_id")
local call_uuid = session:getVariable("uuid")
local audio_file = session:getVariable("voxora_audio_file")
local amd_action = session:getVariable("voxora_amd_action") or "play_on_human"
local voicemail_audio = session:getVariable("voxora_voicemail_audio")

-- Report to ESL event system
local function report_event(event_name, data)
    local e = freeswitch.Event("CUSTOM", "voxora::" .. event_name)
    e:addHeader("campaign_id", campaign_id or "")
    e:addHeader("call_uuid", call_uuid or "")
    for k, v in pairs(data) do
        e:addHeader(k, tostring(v))
    end
    e:fire()
end

-- AMD detection using SpanDSP
local amd_result = "NOTSURE"
local amd_tone_len = 0

if session:ready() then
    session:execute("spandsp_stop_dtmf")
    local amd_res = session:executeString("execute_extension", "detect_amd XML voxora_outbound")
    amd_result = session:getVariable("amd_result") or "HUMAN"
    amd_tone_len = tonumber(session:getVariable("amd_tone_length")) or 0
end

freeswitch.consoleLog("INFO", string.format("[Voxora AMD] UUID: %s | Result: %s | ToneLen: %d\n", 
    call_uuid, amd_result, amd_tone_len))

if amd_result == "HUMAN" then
    report_event("human_answer", { result = "human" })
    if audio_file and session:ready() then
        session:execute("playback", audio_file)
    end
elseif amd_result == "MACHINE" then
    report_event("machine_answer", { result = "machine", tone_len = amd_tone_len })
    if amd_action == "voicemail_drop" and voicemail_audio then
        -- Wait for beep then drop voicemail
        if amd_tone_len > 0 then
            session:execute("playback", voicemail_audio)
        else
            session:execute("sleep", "2000")
            session:execute("playback", voicemail_audio)
        end
    elseif amd_action == "hangup_on_machine" then
        session:execute("hangup")
    end
elseif amd_result == "NOTSURE" then
    report_event("amd_uncertain", { result = "notsure" })
    -- Default to playing audio
    if audio_file and session:ready() then
        session:execute("playback", audio_file)
    end
end

if session:ready() then
    session:execute("hangup")
end
