# polyjose JavaScript API

The API of the `@polyjose/node` and `@polyjose/wasm` packages. Both export the same functions, types and errors, so this one reference covers both.

This reference is generated from the TypeScript declarations of the JavaScript packages in the polyjose repository at commit `f94b84a` (the 0.2.0 release). They declare the same API as the `.d.ts` files in the published `@polyjose/node` 0.2.0 and `@polyjose/wasm` 0.2.0 packages.

- Every function returns a Promise. A polyjose failure rejects it with a `PolyjoseError`: a subclass of `Error` whose `name` is `"PolyjoseError"` and whose read-only `code` is one of `ERROR_CODES`. Branch on `code`, never on `message`. [Errors](/concepts/errors/) explains each code.
- Each exported function is described on the {@link PolyjoseApi} interface, under the same name.
- Verify and decrypt options take a required list of allowed algorithms (`allowedAlgs`, and `allowedEnc` for JWE). `none` is never accepted.
- [One API on every platform](/concepts/one-api/) lists the same operations in Rust, Kotlin and Swift.
