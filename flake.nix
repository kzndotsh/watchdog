{
  description = "OSINT investigation + Watchdog platform — pipeline, web, API, CLI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
        python = pkgs.python313;
        pythonPkgs = python.pkgs;

        names-dataset = pythonPkgs.buildPythonPackage rec {
          pname = "names-dataset";
          version = "3.3.1";
          format = "setuptools";
          src = pkgs.fetchurl {
            url = "https://files.pythonhosted.org/packages/ca/d1/5f9d26f4090035e482f8971a9c3f6b04ed3fc92340c6bb0c349e408aa62b/names_dataset-3.3.1.tar.gz";
            hash = "sha256-VfF9D/+XbWmsWdUYHj3Uw2AbGFI86HbLvYP4fw73/RE=";
          };
          propagatedBuildInputs = [ pythonPkgs.pycountry ];
          doCheck = false;
          pythonImportsCheck = [ "names_dataset" ];
        };

        pythonEnv = python.withPackages (ps: with ps; [
          # Core pipeline
          pyyaml
          httpx
          requests
          beautifulsoup4
          aiohttp

          # Testing / linting
          pytest

          # NLP — name detection
          names-dataset
          pycountry

          # Validation — phones, emails
          phonenumbers
          email-validator

          # OSINT APIs
          shodan
          ipwhois

          # Tor control
          stem
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pythonEnv
            pkgs.just
            pkgs.jq
            pkgs.ripgrep
            pkgs.git
            pkgs.git-lfs
            pkgs.ruff

            # --- OSINT: Identity / Username ---
            pkgs.sherlock          # username enumeration across 400+ sites
            pkgs.maigret           # deep username profiling
            pkgs.holehe            # email → registered accounts
            pkgs.socialscan        # email/username availability checking
            pkgs.ghunt             # Google account OSINT
            pkgs.h8mail            # email breach hunting

            # --- OSINT: DNS / Infrastructure ---
            pkgs.dnsutils          # dig, nslookup, nsupdate
            pkgs.dnsx              # fast multi-purpose DNS toolkit
            pkgs.massdns           # bulk DNS resolution
            pkgs.subfinder         # passive subdomain discovery
            pkgs.amass             # deep DNS enumeration + network mapping
            pkgs.tlsx              # TLS/cert grabber (cert transparency, SAN)
            pkgs.whois             # WHOIS lookups
            pkgs.testssl           # comprehensive TLS/SSL testing
            pkgs.certspotter       # certificate transparency log monitor

            # --- OSINT: Web / Evidence Collection ---
            pkgs.waybackurls       # fetch Wayback Machine URLs for a domain
            pkgs.gau               # GetAllUrls (wayback, commoncrawl, etc)
            pkgs.httpx             # HTTP probing at scale
            pkgs.katana            # next-gen web crawler
            pkgs.photon            # web crawler (URLs, files, intel, endpoints)
            pkgs.exiftool          # EXIF/metadata extraction
            pkgs.yt-dlp            # video evidence archiving
            pkgs.gallery-dl        # image archiving from social platforms
            pkgs.wget2             # recursive site mirroring

            # --- OSINT: Network Scanning ---
            pkgs.nmap              # port scanning, service detection, OS fingerprint
            pkgs.rustscan          # fast port scanner (feeds into nmap)
            pkgs.nuclei            # vulnerability scanning with templates
            pkgs.ffuf              # web fuzzer (dirs, params)
            pkgs.feroxbuster       # recursive content discovery

            # --- OSINT: Network Diagnostics ---
            pkgs.mtr               # traceroute + ping combined
            pkgs.traceroute        # basic traceroute

            # --- OSINT: Frameworks ---
            pkgs.sn0int            # semi-automatic OSINT framework
            # bbot — install via pipx (nixpkgs 2.7.2 is broken, use: pipx install bbot)
            pkgs.metabigor         # OSINT task runner
            pkgs.maltego           # GUI graph-based OSINT

            # --- OSINT: API / Search ---
            pkgs.uncover           # search exposed hosts (shodan, censys, etc)
            pkgs.asn               # ASN/IP/BGP/network OSINT

            # --- Privacy / OpSec ---
            pkgs.torsocks          # route tools through Tor
            pkgs.aria2             # multi-protocol bulk downloader

            # --- Secrets Management ---
            pkgs.sops              # encrypt API keys in-repo

            # --- External Tool Management ---
            pkgs.pipx              # install bbot, etc. outside nix (pipx install bbot)

            # --- Packet Analysis ---
            pkgs.termshark         # terminal UI for wireshark

            # --- Diagramming ---
            pkgs.graphviz          # dot/neato for infrastructure topology diagrams

            # --- Watchdog platform (web / API / CLI / ops) ---
            pkgs.nodejs_24         # TanStack Start / Vite
            pkgs.pnpm              # JS monorepo package manager
            pkgs.uv                # Python workspace (api, worker, wd-core, wd-cli)
            pkgs.turbo             # Turborepo task runner (optional; pnpm dlx turbo also fine)
            pkgs.docker-compose    # Compose for Postgres/Redis/MinIO
            pkgs.postgresql_18     # psql client + local tooling
            pkgs.redis             # redis-cli
            pkgs.minio-client      # mc — MinIO admin
            pkgs.caddy             # reverse proxy (local / VPS)
            pkgs.openssl           # certs / JWT debugging
            pkgs.curl
            pkgs.watchexec         # optional file-watch restarts
            pkgs.lefthook          # git hooks (lint / typecheck)
            pkgs.chromium          # Playwright e2e on NixOS (bundled browsers lack glib)
          ];

          shellHook = ''
            # Keep pipeline importable; do NOT put repo root ahead of .venv site-packages
            # (that breaks uv-managed pytest/cryptography resolution).
            export PYTHONPATH="$PWD/pipeline''${PYTHONPATH:+:$PYTHONPATH}"
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            export UV_PROJECT_ENVIRONMENT="''${UV_PROJECT_ENVIRONMENT:-$PWD/.venv}"
            export PATH="$PWD/.venv/bin:$PATH"
            # Python in .venv has no bundled CA store; without this desloppify's
            # network calls fail SSL verification on NixOS.
            export SSL_CERT_FILE="''${SSL_CERT_FILE:-${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt}"
            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${pkgs.chromium}/bin/chromium"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
            if [ -f lefthook.yml ] && command -v lefthook >/dev/null 2>&1; then
              lefthook install >/dev/null 2>&1 || true
            fi
            echo "Watchdog / OSINT shell: node=$(${pkgs.nodejs_24}/bin/node -v) pnpm=$(${pkgs.pnpm}/bin/pnpm -v) uv=$(${pkgs.uv}/bin/uv --version | awk '{print $2}')"
          '';
        };
      }
    );
}
