// A probe retry is not a second independent observation. Only spaced scheduler
// observations confirm transitions; Redis serializes workers and ignores replays.
export const NODE_INCIDENT_SCRIPT = `
local now=tonumber(ARGV[1])
local healthy=ARGV[2]=='1'
local muted=ARGV[3]=='1'
local armed=ARGV[4]=='1'
local wall=tonumber(ARGV[5])
local raw=redis.call('GET',KEYS[1])
local s=raw and cjson.decode(raw) or {last=0,armed=armed,open=false,count=0,since=now,healthy=healthy}
if now<=s.last then return 0 end
if now-s.last>90000 or s.healthy~=healthy or s.muted~=muted or muted then s.count=0;s.since=now end
s.last=now;s.healthy=healthy;s.muted=muted
s.pending=s.pending or {}
if muted then s.pending={} end
if healthy or armed then s.armed=true end
local event=0
if not muted then
 s.count=s.count+1
 if not healthy and s.armed and not s.open and s.count>=3 and now-s.since>=20000 then
  s.open=true;s.count=0;s.since=now;event=1
 elseif healthy and s.open and s.count>=2 and now-s.since>=10000 then
  s.open=false;s.count=0;s.since=now;event=2
 end
end
if event~=0 then
 table.insert(s.pending,{kind=event,owner=0,lease=0})
 if #s.pending>32 then table.remove(s.pending,1) end
end
event=0
if not muted and #s.pending>0 and s.pending[1].lease<=wall then
 s.pending[1].owner=now;s.pending[1].lease=wall+30000;event=s.pending[1].kind
end
redis.call('SET',KEYS[1],cjson.encode(s),'EX',604800)
return event
`;

export const ACK_NODE_INCIDENT_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 0 end
local s=cjson.decode(raw)
if s.pending and #s.pending>0 and s.pending[1].owner==tonumber(ARGV[1]) and s.pending[1].kind==tonumber(ARGV[2]) then
 table.remove(s.pending,1)
 redis.call('SET',KEYS[1],cjson.encode(s),'EX',604800)
 return 1
end
return 0
`;
