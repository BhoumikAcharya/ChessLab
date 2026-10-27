Stockfish.js 16.0.0 — matching source and build instructions

ChessLab serves the unmodified single-threaded Stockfish.js/WASM files from
npm stockfish@16.0.0. The npm release records this Git commit:
  efc5758a1cf72ec7644fa771a1f17fcbfdae410e

The complete upstream repository archive for that commit is available beside
this document as stockfish-16.0.0-source.tgz. It includes C++ source, headers,
Makefiles, JavaScript wrappers, build.js, the NNUE network, authors, and GPLv3.
It also includes the prebuilt engine files used by ChessLab. Their bytes were
compared with the installed npm release and match exactly. ChessLab does not
modify those engine files.

The .tgz filename preserves the original archive bytes and avoids servers that
interpret a .gz suffix as a transparent HTTP Content-Encoding.

Source origin:
https://codeload.github.com/nmrugg/stockfish.js/tar.gz/efc5758a1cf72ec7644fa771a1f17fcbfdae410e
Package metadata:
https://registry.npmjs.org/stockfish/16.0.0

Source archive SHA-256:
e9334f6baec2a83f93a21fe90345a0aaf837a42ba0bd04813d9b051104b7568f
Engine JS SHA-256:
e2958bb89fc6ee0faedde87284bbb7e14da2ab224f06ca1bd82e62eaca87d00b
Engine WASM SHA-256:
a7acf7f20cb81d755b39b3dd42a4bdfd6e8c8d3d203d9fbdc525e40e1f68df08

Building the single-threaded engine
---------------------------------
Use a development machine with Node.js, Python, make, and the Emscripten SDK.
The upstream build.js explicitly expects Emscripten 2.0.26. Follow the SDK's
installation instructions at https://emscripten.org/docs/getting_started/
and activate that version (emsdk install 2.0.26; emsdk activate 2.0.26), then
load its emsdk_env.sh into the current shell. Those general-purpose tools are
not required by visitors to ChessLab or by the static hosting server.

  tar -xzf stockfish-16.0.0-source.tgz
  cd stockfish.js-efc5758a1cf72ec7644fa771a1f17fcbfdae410e
  node build.js --help
  node build.js --single-threaded --version=16 --basename=stockfish-nnue-16-single

The resulting files are under src/:
  stockfish-nnue-16-single.js
  stockfish-nnue-16-single.wasm

Read the archive's Readme.md, README.upstream.md, src/Makefile and build.js for
upstream build details. The source archive already contains the default network
src/nn-5af11540bbfe.nnue; no separate network download is necessary.

The source and distributed prebuilt assets were verified against each other.
We have not recompiled the engine with the historical Emscripten toolchain or
claimed a bit-for-bit reproducible rebuild. ChessLab's application build copies
the verified prebuilt assets and does not invoke the engine compiler.

License
-------
Stockfish.js / Stockfish are GPLv3. See ../COPYING.txt and ../AUTHORS, and the
archive's Copying.txt. Preserve this source archive, instructions, provenance,
and notices when redistributing the engine. No warranty is provided.
