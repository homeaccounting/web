{
  description = "Web — HomeAccounting frontend client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        devDependencies = with pkgs; [
          nodejs_22
          pnpm
          just
          gettext
        ];
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = devDependencies;
          shellHook = ''
            echo "💰 Accounting Web Development Environment"
            echo "📦 Node version: $(node --version)"
            echo "📦 pnpm version: $(pnpm --version)"
            echo "🔧 Quick Commands (using just):"
            echo "  • just --list      - Show all available commands"
            echo "  • just install     - Install dependencies"
            echo "  • just run         - Start dev server"
            echo "  • just build       - Production build"
            echo "  • just test        - Run tests"
            echo "  • just check       - typecheck + lint + format-check"
            echo ""
            echo "🚀 Get started: just dev-setup"
          '';
        };
      });
}
