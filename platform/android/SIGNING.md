# Android update identity

The release APK uses the app ID app.slate.workspace and a preserved RSA 4096 signing identity. Android requires this identity to update an existing installation while retaining its private workspace. Increment versionCode for each update; retain the app ID, HTTPS localhost origin and signing identity.

slate-release.keystore.enc.json contains only an authenticated encrypted PKCS12 keystore, its random salt/nonce, and the public certificate fingerprint. Encryption uses Node's AES-256-GCM and scrypt (N=32768, r=8, p=1). The recovery password was generated with 256 bits of randomness and is provided privately to the project owner. It is excluded from Git, source archives and the APK.

Keep the recovery password in a password manager or another private backup. Losing it prevents building updates with this identity. It is a development credential; users do not need it to install or use Slate.

Set `JAVA_HOME` to a JDK 21 installation and `ANDROID_HOME` to the Android SDK. Put the password in a private file outside the repository and run:

    npm run android:release -- --password-file /private/path/slate-signing.password

The helper authenticates and decrypts the key, writes it to a private temporary directory, checks TypeScript, rebuilds the independent web bundle, synchronizes Capacitor, signs the release build, and verifies its signature, certificate and bundled files. It removes that temporary key even on failure. Gradle receives the key password through the process environment, not command-line arguments. Never commit a plaintext keystore or password file. Gradle refuses release tasks without signing credentials.

The expected certificate SHA-256 fingerprint is recorded in the encrypted envelope and the release artifact manifest. Verify the output with the Android SDK's apksigner verify --verbose --print-certs command.

Debug builds use the separate Android development key. Do not install a debug build over a release workspace or discard a workspace to resolve a signature mismatch. Use a disposable emulator for development checks.

`npm run android:build` performs the same build and file/signature verification for a debug APK. Version 0.1.6 has versionCode 7 and retains the application ID and localhost origin. Both variants require Android API 24 or later. A verified debug APK still cannot update the original signed release.
