const JS_INDENT = 2

export function changeLocation(content, filename) {
  const manifest = JSON.parse(content)

  manifest.location = Object.keys(manifest.location).reduce((accumulator, productKey) => {
    const productLocations = manifest.location[productKey]

    const updatedLocations = Object.keys(productLocations).reduce((locations, locationKey) => {
      const value = productLocations[locationKey]

      return {
        ...locations,
        [locationKey]: {
          ...value,
          url: process.env.VITE_ZENDESK_LOCATION
        }
      }
    }, {})

    return {
      ...accumulator,
      [productKey]: updatedLocations
    }
  }, {})

  const manifestOutput = {
    _warning: `AUTOMATICALLY GENERATED FROM $/src/${filename} - DO NOT MODIFY THIS FILE DIRECTLY`,
    ...manifest
  }

  return JSON.stringify(manifestOutput, null, JS_INDENT)
}
