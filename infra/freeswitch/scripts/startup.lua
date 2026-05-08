-- Voxora FreeSWITCH startup script
freeswitch.consoleLog("INFO", "[Voxora] FreeSWITCH Lua runtime initialized\n")
freeswitch.consoleLog("INFO", string.format("[Voxora] Public IP: %s\n", 
  freeswitch.getGlobalVariable("public_ip") or "unknown"))
