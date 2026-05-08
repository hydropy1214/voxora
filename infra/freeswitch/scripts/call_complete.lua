--[[
  Voxora Call Complete Handler
  Called after bridge failure/completion
]]
local uuid        = session:getVariable("uuid") or ""
local campaign_id = session:getVariable("voxora_campaign_id") or ""
local cause       = session:getVariable("hangup_cause") or "UNKNOWN"
local billsec     = tonumber(session:getVariable("billsec") or "0")

freeswitch.consoleLog("INFO", string.format(
  "[Voxora Call] Complete: UUID=%s Campaign=%s Cause=%s Duration=%ds\n",
  uuid, campaign_id, cause, billsec
))

-- Fire completion event for backend ESL listener
local e = freeswitch.Event("CUSTOM", "voxora::call_complete")
e:addHeader("call_uuid",    uuid)
e:addHeader("campaign_id",  campaign_id)
e:addHeader("hangup_cause", cause)
e:addHeader("billsec",      tostring(billsec))
e:fire()
