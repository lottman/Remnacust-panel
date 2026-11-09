# Subscription proxy on a separate server

[Русский](SUBSCRIPTION-PROXY.md) · English

## What is proxied

Client → separate proxy sub.example.net → subscription-page server 198.51.100.20 → panel API. This proxies subscription delivery, not node VPN traffic. Connecting to a fixed IP bypasses origin DNS lookup; Host selects the origin site, while SNI and certificate verification authenticate its name. In this example origin.example.net is the primary page domain and sub.example.net its CDN/proxy domain. All addresses and keys are examples. Only the server-side page needs the private panel address; do not expose it to clients.

## Prepare the panel and servers

In Subscription → Settings → Subscription pages, add primary origin.example.net and child CDN sub.example.net. Copy the individual request-header name and value from Configure CDN. The X-… name and UUID/signature value are different for each CDN. Point sub.example.net DNS at the separate proxy; the origin certificate must match origin.example.net. The origin HTTPS site must forward complete paths to an updated subscription page. Keep its REMNAWAVE_PANEL_URL and API token in the private server-side .env. Update separately hosted pages independently of the panel.

## Provider CDN, separate origin and legacy links

With a provider CDN: client → CDN → origin.example.net on a separate server → Caddy → local subscription page → private panel API; responses follow the reverse path. Point public sub.example.net to the CDN using the provider-required A or CNAME record. Set the CDN source to the page HTTPS hostname or its IP, with Host and SNI origin.example.net. Configure the individual panel header pair on CDN REQUESTS, never responses. Origin Caddy forwards the complete request to the local page. Port 3010 is an example: use your published port bound only to loopback. This block assumes Caddy on the same host; in a separate Docker network use the service name and its port instead of 127.0.0.1.

```caddyfile
origin.example.net {
    reverse_proxy 127.0.0.1:3010
}
```

For a migration without cutting off clients, retain legacy.example.net as a registered OPEN primary with working HTTPS forwarding to the page. Keep its DNS and certificate so imported links still work. Make origin.example.net the default primary and issue sub.example.net CDN links from user cards or the link API to new clients. Change explicit legacy user assignments separately; their keys need not change. SUB_PUBLIC_DOMAIN remains the origin primary synchronized with panel settings, not its child CDN. To omit the new origin from client link lists, select CDN only or Redirect to CDN. An already imported legacy URL does not disappear automatically. A Caddy block alone without panel registration is insufficient: unknown hostnames may be rejected. Retire the old domain only after clients migrate.

## Forward the complete path

Proxy /KEY, /KEY/json, device links and every /geofiles/... path, including .dat, .sha256 and query parameters. Preserve any configured subscription prefix; these examples assume an empty prefix. Do not prepend /api/sub to every request: direct panel API access is a different topology. Keep the URI and avoid redirects to private service addresses. Preserve client User-Agent, Accept and HWID headers, plus Routing, Profile-Title, Subscription-Userinfo, Content-Type and ETag responses. Overwrite only your own CDN header. Do not force caching of pages, subscriptions or errors; respect origin Cache-Control for DAT. An HTML 200 does not prove that JSON and geofiles work.

## Caddy: connect to an origin IP over HTTPS

Place this block in the separate server’s Caddyfile. Set SUB_ORIGIN_HEADER and SUB_ORIGIN_VALUE in the Caddy service environment using Configure CDN values; keep them private and do not publish expanded configurations. Caddy obtains the public certificate when ACME is reachable; this example does not configure DNS or firewall. Host is explicit for Caddy 2.9/2.10 as well. Origin TLS verification remains enabled; tls_insecure_skip_verify is unnecessary.

```caddyfile
sub.example.net {
    reverse_proxy https://198.51.100.20 {
        header_up Host origin.example.net
        header_up {$SUB_ORIGIN_HEADER} {$SUB_ORIGIN_VALUE}
        transport http {
            tls_server_name origin.example.net
            dial_timeout 5s
            response_header_timeout 30s
        }
    }
}
```

## Nginx: HTTPS with hostname verification

Provide a valid public-domain certificate. Store exactly one proxy_set_header directive with the panel’s individual name/value in private /etc/nginx/private/sub-origin-header.conf. Replace the example pair below. Keep the file outside the webroot and administrator-only; the standard Nginx root master reads it at startup. For an unprivileged deployment, grant reading only to the required service. proxy_pass without a URI preserves paths and queries; certificate verification and SNI are explicit.

```nginx
server {
    listen 443 ssl;
    server_name sub.example.net;
    access_log off;
    ssl_certificate /etc/letsencrypt/live/sub.example.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sub.example.net/privkey.pem;
    location / {
        proxy_pass https://198.51.100.20;
        proxy_http_version 1.1;
        proxy_set_header Host origin.example.net;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        include /etc/nginx/private/sub-origin-header.conf;
        proxy_ssl_server_name on;
        proxy_ssl_name origin.example.net;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_cache off;
        proxy_buffering off;
    }
}
```

```nginx
proxy_set_header X-0123456789abcdef01234567 "00000000-0000-4000-8000-000000000001.0000000000000000000000000000000000000000000000000000000000000000";
```

## Verify and diagnose

The example disables Nginx access logging so subscription keys do not enter ordinary request logs. Restrict access to error logs too: they may contain URIs. For verification, enter your test KEY without echo and press Enter; JSON is saved in a separate private directory. Remove it after checking.

Validate with caddy validate --config /etc/caddy/Caddyfile or nginx -t before restricting the origin. In these commands KEY is your private test subscription key; keep it out of public logs. The first --resolve command verifies the IP, SNI and certificate without origin DNS lookup; it does not bypass access policy. Once CDN only is enabled, direct requests without the signed header should return 403. The second command checks the proxy. Test the base URL with each supported application’s real User-Agent too. Obtain actual DAT URLs from the Routing header and download both files and checksums; an invented /geofiles/test.dat is not a valid check. DAT-only 404: check /geofiles forwarding and origin page version. 403: check policy and the CDN header pair. 502/504: check origin connectivity, TLS and logs. Do not use unlimited timeouts.

```bash
umask 077
CHECK_DIR=$(mktemp -d)
IFS= read -r -s KEY
curl --fail --silent --show-error --resolve origin.example.net:443:198.51.100.20 "https://origin.example.net/${KEY}/json" -H 'User-Agent: INCY/2.6.2/ios' -o "$CHECK_DIR/origin.json"
curl --fail --silent --show-error https://sub.example.net/KEY/json -H 'User-Agent: INCY/2.6.2/ios' -o "$CHECK_DIR/proxy.json"
```

## Restrict the origin and protect secrets

After successful checks, enable CDN only on the primary: the correct signed pair permits origin requests. Redirect to CDN sends clients a 307; Closed denies the entire family including CDNs. These are different modes. The last primary cannot be fully closed. For network isolation, separately allow origin HTTPS only from proxy/CDN IPs while retaining SSH, management API and certificate issuance/renewal; check the hosting firewall too. Across a private protected network, HTTP can go directly to the page port with the public-domain Host instead of origin HTTPS; never expose that port publicly or send credentials over public HTTP. The CDN header is not an API token and does not erase origin IPs from DNS/history. Private addresses, Authorization and CDN secrets must not appear in response bodies, Location headers, response headers or webroots.

[Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) · [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
