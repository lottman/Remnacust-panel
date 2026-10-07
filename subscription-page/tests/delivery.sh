#!/usr/bin/env bash
set -Eeuo pipefail
base=$(cd "$(dirname "$0")" && pwd)
public=$(cd "$base/../.." && pwd)
panel_image=${1:?Pass panel image}
page_image=${2:?Pass subscription-page image}
test_root=$(mktemp -d -t remnacust-subpage-live.XXXXXXXX)
test_project="remnacust-subpage-live-$$"
cleanup_test() {
    local result=$?
    if ((result)); then cat "$test_root/operation.log" 2>/dev/null || true; docker logs --tail 30 "$test_project-page" 2>&1 || true; fi
    docker rm -f "$test_project-page" >/dev/null 2>&1 || true
    docker compose -p "$test_project" -f "$test_root/deploy/compose.json" down --volumes >/dev/null 2>&1 || true
    [[ $test_root == /tmp/remnacust-subpage-live.* ]] && rm -rf -- "$test_root"
}
trap cleanup_test EXIT
export REMNACUST_ROOT="$test_root/root"
source "$public/installer/installer.sh"
ROOT=$REMNACUST_ROOT; WORK="$test_root/work"; mkdir -p "$WORK" "$ROOT/registry"
LOG="$test_root/operation.log"; SOURCE=$public; HELPER="$public/installer/runtime.py"
COMPONENT=panel; ACTION=install-panel; PROXY=existing; DOMAIN=panel.example.com; PORT=43875
DIRECTORY="$test_root/deploy"; PROJECT=$test_project; IMAGE=$panel_image
fresh_files
compose up -d >/dev/null
step 'Test panel ready' wait_ready
app_id=$(compose ps --quiet remnawave)
docker exec -i "$app_id" node - > "$test_root/subpage.env" <<'JS'
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');const p=new PrismaClient();
(async()=>{
const raw={tag:'delivery-test',port:443,listen:'0.0.0.0',protocol:'vless',settings:{clients:[],decryption:'none'},streamSettings:{network:'tcp',security:'none'}};
const profile=await p.configProfiles.create({data:{name:'delivery-test',config:{inbounds:[raw],outbounds:[{protocol:'freedom',tag:'direct'}]}}});
const inbound=await p.configProfileInbounds.create({data:{profileUuid:profile.uuid,tag:raw.tag,type:'vless',network:'tcp',security:'none',port:443,rawInbound:raw}});
const node=await p.nodes.create({data:{name:'offline-test',address:'127.0.0.1',port:65534,isConnected:false,activeConfigProfileUuid:profile.uuid}});
await p.configProfileInboundsToNodes.create({data:{nodeUuid:node.uuid,configProfileInboundUuid:inbound.uuid}});
const squad=await p.internalSquads.create({data:{name:'delivery-test'}});
await p.internalSquadInbounds.create({data:{internalSquadUuid:squad.uuid,inboundUuid:inbound.uuid}});
const user=await p.users.create({data:{username:'delivery_test',shortUuid:'delivery-test-1-1-1',hwidDeviceLimit:0,expireAt:new Date(Date.now()+86400000),vlessUuid:require('node:crypto').randomUUID(),trojanPassword:'test-trojan-secret',ssPassword:'test-ss-secret',traffic:{create:{}}}});
await p.internalSquadMembers.create({data:{userId:user.id,internalSquadUuid:squad.uuid}});
const host=await p.hosts.create({data:{remark:'offline-allowed',address:'offline-fixture.example',port:443,configProfileUuid:profile.uuid,configProfileInboundUuid:inbound.uuid}});
await p.hostsToNodes.create({data:{hostUuid:host.uuid,nodeUuid:node.uuid}});
const t=await p.apiTokens.create({data:{name:'page-test',expireAt:new Date(Date.now()+3600000),scopes:['*']}});
console.log('REMNAWAVE_PANEL_URL=http://remnawave:3000\nAPP_PORT=3010\nTRUST_PROXY=1\nREMNAWAVE_API_TOKEN='+jwt.sign({uuid:t.uuid,username:null,role:'API'},process.env.APP_SECRET,{expiresIn:'1h'}));
})().finally(()=>p.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1});
JS
docker run -d --name "$test_project-page" --network "${test_project}_default" --env-file "$test_root/subpage.env" -p 127.0.0.1:43876:3010 "$page_image" >/dev/null
for attempt in $(seq 1 60); do
    if docker exec "$test_project-page" curl -fsS http://127.0.0.1:3010/internal/health >/dev/null 2>&1; then break; fi
    sleep 1
done
python3 "$base/delivery.py" "$app_id" "$test_project-page"
