Several dependencies are currently added to the overall project PyInstallers.  The places to update can be found with "customtkinter"

```
pdfplumber PyMuPdf tqdm chardet tree-sitter tree-sitter-python tree-sitter-javascript tree-sitter-typescript tree-sitter-html tree-sitter-css tree-sitter-cpp tree-sitter-c-sharp tree-sitter-rust tree-sitter-ruby tree-sitter-go tree-sitter-java openai tiktoken prompt_toolkit msgpack pyyaml json-repair aiofiles python-ulid requests fastapi uvicorn itsdangerous websockets python-multipart discord.py python-telegram-bot matrix-nio beautifulsoup4 ddgs partial-json-parser filetype tree_sitter_language_pack mcp simpleeval typer tomli rich flask

--collect-all pdfplumber --collect-all PyMuPdf --collect-all fitz --collect-all tqdm --collect-all chardet --collect-all openai --collect-all tiktoken --hidden-import=tiktoken_ext.openai_public --hidden-import=tiktoken_ext --collect-all prompt_toolkit --collect-all msgpack --collect-all yaml --collect-all json_repair --collect-all aiofiles --collect-all ulid --collect-all requests --collect-all fastapi --collect-all uvicorn --collect-all itsdangerous --collect-all websockets --collect-all multipart --collect-all discord --collect-all telegram --collect-all matrix-nio --collect-all bs4 --collect-all ddgs --collect-all mcp --collect-all simpleeval --collect-all typer --add-data "./esoExtras:./esoExtras"

- customtkinter
- pdfplumber
- PyMuPdf
- tqdm
- openai
- tiktoken
- prompt_toolkit
- msgpack
- pyyaml
- json-repair
- aiofiles
- python-ulid
- requests
- fastapi
- uvicorn
- itsdangerous
- websockets
- python-multipart
- discord.py
- python-telegram-bot
- matrix-nio
- beautifulsoup4
- ddgs
- mcp
- simpleeval
- typer
```

Known gotchas and proposed fixes:

- Discord bot channel parse failure
	- Symptom: f-string parser error at esoExtras/opticlaw/channels/discord_bot/channel.py line 267.
	- Why it happens: nested braces in that f-string are malformed.
	- Proposed fix: rewrite the expression as f"> {'...'+line[-244:].rstrip()+'...' if len(line) > 250 else line}" or precompute the truncated value first and inject only a single variable into the f-string.

- Frozen-build dependency warning noise
	- Symptom: warnings that dependencies are missing in frozen/PyInstaller runs even when modules later load.
	- Why it happens: the pre-check relies on metadata lookup and can misreport in bundled runtimes.
	- Proposed fix: in esoExtras/opticlaw/core/modules.py, make missing-dependency detection use requirement parsing plus import-spec probing in frozen mode and downgrade those pre-check warnings to advisory unless import actually fails.

- OpenLumara websocket origin allowlist localhost mismatch
	- Symptom: websocket handshake rejected as foreign origin even when extra_allowed_origins includes localhost:PORT (for example, Origin http://localhost:15021 or https://localhost:5001).
	- Why it happens: in OpenLumara's websocket origin check path, allowlist entries normalize localhost to 127.0.0.1 before comparison, but the incoming Origin host can remain localhost in that branch. This creates an asymmetric compare (127.0.0.1 vs localhost) and the match fails.
	- Replication steps:
		1. Launch OpenLumara with network_mode=custom, custom_host=0.0.0.0, port=15021.
		2. Include localhost:15021 in extra_allowed_origins.
		3. Open http://localhost:15021 and watch logs for websocket handshake rejected: foreign origin 'http://localhost:15021'.
		4. Open http://127.0.0.1:15021 and observe websocket connects (workaround path).
	- Current mitigation in KoboldCpp proxy: rewrite OpenLumara-bound Origin host to 127.0.0.1 and inject required OpenLumara API guard headers when proxying.
	- Temporary operator workaround for non-proxy direct access: use http://127.0.0.1:15021 instead of localhost until upstream fix lands.
	- Proper upstream fix: in OpenLumara, normalize origin_host localhost to 127.0.0.1 before host equality checks so both sides use the same canonical form.