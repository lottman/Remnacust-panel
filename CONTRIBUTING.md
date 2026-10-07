# Contributing to Remnacust

Read [README.md](README.md) and [NOTICE.md](NOTICE.md) before changing components. Describe the affected workflow, final behavior and relevant validation in each pull request. Preserve compatibility with existing installations and the licenses of upstream and vendored code.

Run the checks for the components you change. Frontend changes must preserve Russian, English, Persian and Chinese translations, keyboard access and reduced-motion behavior. Core changes require rebuilding the editor WASM/schemas and the node's verified source archive. API changes require regenerating OpenAPI and the panel documentation.

Do not commit private environments, database copies, node secrets, SSH keys or production credentials. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).
