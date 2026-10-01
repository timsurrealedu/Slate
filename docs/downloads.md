# Slate 0.1.0 downloads

These preview files download without the hosting provider’s sign-in screen. Each public download was checked against the built file with SHA-256 and ZIP integrity validation.

| Download                                                                                                                                                       | Size      | Validation                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| [Windows x64 portable application](https://d2ol7oe51mr4n9.cloudfront.net/user_3F27Q3VjiHRYnem5bzzoh3Mnmk0/154d5af8-6f40-4d00-a708-91e2bf1f43a0.zip)            | 155.0 MiB | Packaged; Windows launch pending                                          |
| [Linux amd64 Debian/Ubuntu package, in a ZIP](https://d2ol7oe51mr4n9.cloudfront.net/user_3F27Q3VjiHRYnem5bzzoh3Mnmk0/258b66b8-41b0-4edc-b158-35a2442b30e7.zip) | 88.1 MiB  | Packaged executable passes Linux smoke; distribution installation pending |
| [Independent web application](https://d2ol7oe51mr4n9.cloudfront.net/user_3F27Q3VjiHRYnem5bzzoh3Mnmk0/c397f935-e88d-4f66-a3a8-8894f546b416.zip)                 | 5.1 MiB   | All 10 production Chromium workflows pass                                 |

The [Android signed APK ZIP](https://d2ol7oe51mr4n9.cloudfront.net/user_3F27Q3VjiHRYnem5bzzoh3Mnmk0/976ff8fd-4223-4813-b778-a8db49d8aad0.zip) is 8.1 MiB. Extract it and tap Slate-0.1.0.apk. Android 7+ is required. Signature, archive integrity, anonymous download and emulator installation checks pass. Runtime workflows remain unverified: this emulator crashes in its system WebView, including with a minimal app containing no Slate code. Physical-device checks remain open.

Each archive contains START-HERE.txt. Windows users should extract the complete folder and run Slate.exe. The Linux archive contains the .deb package. The web archive needs a static HTTPS or localhost server.

Desktop packages are unsigned previews. Android is signed with the preserved Slate release identity. Physical stylus and Windows/Android device validation remain open.

Exact byte counts and SHA-256 hashes are in [the artifact manifest](releases/0.1.0-artifacts.json). Build instructions and local data locations are in [README](../README.md).

The [updated source archive](https://d2ol7oe51mr4n9.cloudfront.net/user_3F27Q3VjiHRYnem5bzzoh3Mnmk0/05758804-68fa-4b44-bf82-71c07a5b927e.zip) includes the Android local Save plugin, signed-build helper, encrypted update identity, dependency lockfile, tests, and current validation records. The private signing recovery password is excluded.
