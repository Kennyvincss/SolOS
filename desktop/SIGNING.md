# Signing the Windows installer

Windows shows "Windows protected your PC" (SmartScreen) for any installer
that isn't signed with a code-signing certificate. Code can't remove the
warning. The installer has to be signed, and that needs a certificate in
your name. Once it's set up, every release is signed automatically.

## Option A: Azure Trusted Signing (recommended, about $10/month)

Microsoft's own signing service. It's the cheapest option, and SmartScreen
trusts it more quickly than an ordinary certificate.

1. Create an Azure account and a **Trusted Signing account** (portal.azure.com → "Trusted Signing").
2. Complete **identity validation** (individual or organization). This takes a few days.
3. Create a **certificate profile** (type "Public Trust").
4. Create an **app registration** (Microsoft Entra ID → App registrations) and a client secret for it.
   Give it the role **Trusted Signing Certificate Profile Signer** on the signing account.
5. In GitHub → repository Settings → Secrets and variables → Actions, add:
   - Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   - Variables:
     - `AZURE_SIGNING_ENDPOINT`: the account's region URL, e.g. `https://eus.codesigning.azure.net`
     - `AZURE_SIGNING_ACCOUNT`: the signing account name
     - `AZURE_SIGNING_PROFILE`: the certificate profile name
     - `AZURE_SIGNING_PUBLISHER`: the exact name on the certificate (the validated identity)

## Option B: a certificate from a certificate authority (DigiCert, Sectigo, ...)

Since 2023 every code-signing certificate's key must live on hardware: a USB
token or a cloud HSM. It can no longer be exported as a `.pfx` file. For the
automatic GitHub build, buy one with **cloud signing**, such as DigiCert
KeyLocker. A USB-token certificate only works by signing by hand on a Windows
PC for every release.

When the certificate is issued, add its KeyLocker credentials (API key,
client-auth certificate and password, certificate fingerprint) as repository
secrets. The build then needs a small change to sign through KeyLocker.

(`WIN_CERT_P12_BASE64` / `WIN_CERT_PASSWORD` still work for an older
certificate that you do have as a `.pfx` file.)

## After signing

Signed installers show your name as the publisher instead of "Unknown
publisher". SmartScreen can still warn for the first downloads of a new
certificate until it has seen enough installs. That usually clears within
days to a few weeks and never comes back for later releases signed with the
same certificate.
