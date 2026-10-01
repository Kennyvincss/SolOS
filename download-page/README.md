# STRATA download page

A standalone download page for the STRATA desktop app (Windows, macOS, Linux).
It is not part of the STRATA website or desktop app and isn't built with them:
`index.html` is a single self-contained file.

- Download links point at the GitHub releases of this repository. The page
  asks GitHub for the newest `desktop-v*` release when it loads and falls back
  to the version written in the file.
- It detects the visitor's computer and offers the matching file first. Phones
  and tablets get a note to open the page on a computer (no mobile builds).

Host it anywhere that serves static files, for example a separate Vercel
project with this folder as its root directory, or GitHub Pages.
