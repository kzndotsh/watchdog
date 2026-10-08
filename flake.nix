{
  description = "Watchdog platform: developer shell (web, API, worker, CLI)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            # JS toolchain (pnpm version is pinned by packageManager in package.json)
            pkgs.nodejs_24
            pkgs.pnpm

            # Local infra: `just up` runs Postgres + S3 (SeaweedFS) in containers.
            # The Docker daemon itself comes from the host.
            pkgs.just
            pkgs.docker-compose
            pkgs.postgresql_18     # psql for scripts/ensure-readonly-role.sh and ad-hoc queries
            pkgs.curl              # scripts/s3-init.sh (SigV4 requests)

            # Hooks and repo tooling
            pkgs.git
            pkgs.lefthook          # pre-commit / commit-msg / pre-push gates
            pkgs.jq
            pkgs.ripgrep

            # Optional advisory scan (`pnpm desloppify:*`): desloppify is a pip package
            pkgs.uv

          ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
            # Playwright e2e on NixOS (bundled browsers lack glib)
            pkgs.chromium
          ];

          shellHook = ''
            # desloppify (uv pip install into .venv) ships native wheels that need libstdc++.
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            export PATH="$PWD/.venv/bin:$PATH"
            # Python in .venv has no bundled CA store; without this desloppify's
            # network calls fail SSL verification on NixOS.
            export SSL_CERT_FILE="''${SSL_CERT_FILE:-${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt}"
            ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
              export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${pkgs.chromium}/bin/chromium"
              export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
            ''}
            if [ -f lefthook.yml ] && command -v lefthook >/dev/null 2>&1; then
              lefthook install >/dev/null 2>&1 || true
            fi
            echo "Watchdog dev shell: node=$(${pkgs.nodejs_24}/bin/node -v) pnpm=$(${pkgs.pnpm}/bin/pnpm -v)"
          '';
        };
      });
    };
}
