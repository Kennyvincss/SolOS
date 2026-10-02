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

## Option B: a certificate file (OV or EV) from a certificate authority

Buy a code-signing certificate (for example from Sectigo, DigiCert or SSL.com),
export it as a `.p12`/`.pfx`, then add these repository secrets:

- `WIN_CERT_P12_BASE64`: the file, base64-encoded (`base64 -w0 cert.pfx`)
- `WIN_CERT_PASSWORD`: its password

Newer certificates are often issued only on a hardware key or a cloud HSM,
which can't be exported as a file. If yours is like that, use Option A.

## After signing

Signed installers show your name as the publisher instead of "Unknown
publisher". SmartScreen can still warn for the first downloads of a new
certificate until it has seen enough installs. That usually clears within
days to a few weeks and never comes back for later releases signed with the
same certificate.
