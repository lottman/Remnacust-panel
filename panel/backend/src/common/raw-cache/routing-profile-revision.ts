// The timestamp must advance on a profile change, not on every subscription GET.
// Shared Redis state keeps API workers from independently reimporting that profile.
export const ROUTING_PROFILE_REVISION_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
local old=nil
if raw then
 local ok,value=pcall(cjson.decode,raw)
 if ok and type(value)=='table' and type(value.fingerprint)=='string' and #value.fingerprint==64 and not value.fingerprint:find('[^a-f0-9]') and type(value.revision)=='number' and value.revision>=0 and value.revision<1000000000000 and value.revision==math.floor(value.revision) then old=value end
end
local retiring=ARGV[3]=='retire'
if retiring and (not old or (old.fingerprint==ARGV[1] and not old.retired)) then return -1 end
if old and old.fingerprint==ARGV[1] and (retiring or not old.retired) then
 redis.call('EXPIRE',KEYS[1],7776000)
 return old.revision
end
local now=tonumber(redis.call('TIME')[1])
local revision=math.max(now,tonumber(ARGV[2]),old and old.revision+1 or 0)
redis.call('SET',KEYS[1],cjson.encode({fingerprint=ARGV[1],revision=revision,retired=retiring}),'EX',7776000)
return revision
`;
