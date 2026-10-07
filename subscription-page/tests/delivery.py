import base64
import gzip
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

def get(url, ua='curl/8.0', **headers):
    before=time.monotonic()
    request=urllib.request.Request(url,headers={'User-Agent':ua,'X-Forwarded-Proto':'https','X-Forwarded-For':'127.0.0.1',**headers})
    try: response=urllib.request.urlopen(request,timeout=15)
    except urllib.error.HTTPError as error: response=error
    with response:
        body=response.read()
        if response.headers.get('Content-Encoding')=='gzip':body=gzip.decompress(body)
        return response.status,body,response.headers,round((time.monotonic()-before)*1000)

panel='http://127.0.0.1:43875/api/sub/delivery-test-1-1-1'
page='http://127.0.0.1:43876/delivery-test-1-1-1'
a=get(panel);b=get(page)
assert a[0]==b[0]==200,(a[0],b[0])
assert a[1]==b[1], 'Raw client bytes changed by subscription proxy'
assert b'offline-fixture.example' in base64.b64decode(b[1]), 'Offline node incorrectly excluded its host'
assert b[2].get('Cache-Control')=='private, no-store'
print(json.dumps({'case':'offline-node-host-and-raw-bytes','http':200,'bytes':len(b[1]),'ms':b[3]}))
browser='Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
html=get(page,browser,**{'Accept':'text/html','Accept-Encoding':'gzip','Accept-Language':'ru'})
assert html[0]==200 and b'id="sbpg"' in html[1],html[0]
assert html[2].get('Content-Encoding')=='gzip'
assert html[2].get('Cache-Control')=='private, no-store'
cookie=html[2].get('Set-Cookie');assert cookie and 'HttpOnly' in cookie and 'Secure' in cookie
print(json.dumps({'case':'browser-page-compression-cookie','http':200,'bytes':len(html[1]),'ms':html[3]}))
missing=get('http://127.0.0.1:43876/unknown-subscription-test',browser,**{'Accept-Language':'ru'})
assert missing[0]==404 and 'Подписка не найдена'.encode() in missing[1]
print('PASS unknown subscription returns localized noncacheable 404')
subprocess.run(['docker','stop',sys.argv[1]],check=True,stdout=subprocess.DEVNULL)
for lang in ['ru','en','fa','zh']:
    failure=get(page,browser,**{'Accept-Language':lang})
    assert failure[0]==503 and failure[2].get('Retry-After')=='30'
    assert failure[2].get('Content-Language')==lang
    assert 'private, no-store'==failure[2].get('Cache-Control')
    assert b'Authorization' not in failure[1] and b'delivery-test-1-1-1' not in failure[1]
    print(json.dumps({'case':'panel-outage-html','language':lang,'http':503,'ms':failure[3]}))
failure=get(page)
assert failure[0]==503 and failure[1], 'Client request received empty success during outage'
subprocess.run(['docker','exec',sys.argv[2],'curl','-fsS','http://127.0.0.1:3010/internal/health'],check=True,stdout=subprocess.DEVNULL)
print('PASS panel outage: browser/client errors, Retry-After and local container health')
