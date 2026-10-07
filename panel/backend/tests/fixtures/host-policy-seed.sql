BEGIN;
INSERT INTO config_profiles(uuid,name,config) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','host-policy-test','{}');
INSERT INTO config_profile_inbounds(uuid,profile_uuid,tag,type,raw_inbound) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','shared','vless','{"protocol":"vless","tag":"shared"}');
INSERT INTO nodes(id,uuid,name,address) VALUES (901,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','test-node','127.0.0.1');
INSERT INTO config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO users(id,username,short_uuid,expire_at,trojan_password,vless_uuid,ss_password) VALUES
 (901,'host-policy-u1','v2-u1',now()+interval '1 day','test','dddddddd-dddd-4ddd-8ddd-dddddddddddd','test'),
 (902,'host-policy-u2','v2-u2',now()+interval '1 day','test','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','test');
INSERT INTO internal_squads(uuid,name) VALUES ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','allowed'),('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','outside');
INSERT INTO internal_squad_members(internal_squad_uuid,user_id) VALUES ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',901),('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',902);
INSERT INTO internal_squad_inbounds(internal_squad_uuid,inbound_uuid) VALUES ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO hosts(uuid,remark,address,port,config_profile_uuid,config_profile_inbound_uuid,tags,always_available,only_when_inactive,internal_squads_mode) VALUES
 ('11111111-1111-4111-8111-111111111111','active','example.org',443,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ARRAY['alpha','beta'],false,false,'ALLOW_ONLY'),
 ('22222222-2222-4222-8222-222222222222','renewal','example.org',443,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ARRAY['alpha'],true,true,'ALLOW_ONLY');
INSERT INTO internal_squad_host_links(host_uuid,squad_uuid) SELECT uuid,'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid FROM hosts;
