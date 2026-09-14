# GeoNames postal-code data

The generated file `geonames-de-postal-codes.json` contains data derived from
the GeoNames Germany postal-code export (`DE.zip`).

- Source: https://download.geonames.org/export/zip/DE.zip
- Provider: https://www.geonames.org/
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Imported source version: 2026-09-14

The import excludes the single GeoNames entry without assignment to one of the
16 German federal states. Multiple place rows sharing a postal code are kept in
the `placeNames` metadata while each postal code remains uniquely bookable.
