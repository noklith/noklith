Portions © 2025 Reown, Inc. All Rights Reserved

This application includes ReownAppKit / WalletConnect Networking, Web3.swift,
CryptoSwift, and their resolved dependencies. Their original license texts are
included in this directory. ReownAppKit-LICENSE.md and
WalletConnect-LICENSE.md retain the separately published upstream terms.

Direct package revisions are declared in apps/ios/swift-package-pins.json.
The cloud build copies all resolved source-package license and notice files
into ResolvedPackages and writes ResolvedPackages/index.json with package
revisions, original paths and SHA-256 hashes. Package.resolved in the build
evidence records the full dependency graph produced by Xcode.

Collection verifies each checkout revision against that lock, keeps nested
legal files, and fails if a resolved package has no license/notice file.
Limits are 128 packages, 100,000 scanned entries, 2,048 legal files,
2 MiB per legal file and 32 MiB total. The build verifies that each legal
file is copied byte-for-byte into the simulator application bundle.

The WalletConnectSigner module is supplied transitively by ReownAppKit;
it is not a separately declared Swift package product.
