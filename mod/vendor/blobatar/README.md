# blobatar 2.7.0

Three standalone entries of [blobatar](https://github.com/Alain00/blobatar)
by Alain00, MIT (see LICENSE), copied from the npm package's `dist/` with
their source map comments removed: `internal.js` (`_posed`, the figure
before its pose is baked), `idle.js` (the idle motion as a pure function
of time) and `expression.js` (the poses). The `.d.ts` files beside them
declare only what `mod/figure.ts` uses.

To update: `npm pack blobatar`, copy the three files from `dist/` again,
and run the mod tests.
