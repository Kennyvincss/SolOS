import { registerRootComponent } from "expo";
import { getRandomBytes } from "expo-crypto";
import nacl from "tweetnacl";

import App from "./App";

// tweetnacl needs a secure random source; React Native has no WebCrypto.
nacl.setPRNG((out, n) => {
  out.set(getRandomBytes(n));
});

registerRootComponent(App);
