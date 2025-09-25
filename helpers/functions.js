function prettifyKey(key) {
  return key
    .replace(/_+/g, ' ')
    .replace(/\s+$/, '')
    .split(' ')
    .map(word =>
      word.length === 2 && /^[a-z]{2}$/.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

function normalizeKey(key) {
  return key
    .toLowerCase()
    .replace(/\s+/g, '_')    // spaces → underscores
    .replace(/_+/g, '_')     // collapse multiple underscores
    .trim();
}

const keyMapping = {
  "flc_quantity_20_ft": "Flc Quantity 20 FT",
  "flc_quantity_40_ft_hc": "Flc Quantity 40 FT HC",
  "expiry_date": "Expiry Date",
  "lead_time_min_days": "Lead Time Min Days",
  "lead_time_max_days": "Lead Time Max Days",
  "more_details": "More Details"
};

exports.transformProducts = (products) => {
  const transform = (product) => {
    const base = {
      id: product?.id,
      name: product.name || null,
      description: product.description || null,
      images: Array.isArray(product?.images)
        ? product.images.map(img => img?.file?.url).filter(Boolean)
        : [],
      price: product.price || null,
      unit_quantity: product.content?.unit_quantity || null,
      unit_quantity_fr: product.content?.unit_quantity_fr || null,
      moq: product.content?.minimum_quantity || null,
      sold_by: product.content?.factory?.name || product?.sold_by || null,
      is_new: product.content?.is_new || false,
      featured: product.content?.featured || null,
      factory: product.content?.factory || false,
      discounted_price: product.discounted_price || null,
      discount_percent: product.discount_percent || null,
      type: product.type || null,
      options: {},
      product_details: {} // <- always present
    };

    // ✅ If product.options exist → process normally
    if (Array.isArray(product.options) && product.options.length) {
      for (const option of product.options) {
        const optionName = option.name;
        if (!Array.isArray(option.values)) continue;

        const formattedValues = option.values.map((value) => {
          const flat = {};
          const details = {};

          for (const [key, val] of Object.entries(value)) {
            const prettyKey = prettifyKey(key);

            if (
              ["id", "name", "price", "shipment_weight", "description",
               "lead_time_min_days", "lead_time_max_days", "minimum_quantity"
              ].includes(key.toLowerCase())
            ) {
              flat[key] = val;
            } else if (Array.isArray(val) && val.length && typeof val[0] === "object") {
              val.forEach(obj => {
                for (const [subKey, subVal] of Object.entries(obj)) {
                  if (subKey !== "id") {
                    details[prettifyKey(`${key}_${subKey}`)] = subVal;
                  }
                }
              });
            } else {
              details[prettyKey] = val;
            }
          }

          flat["product_details"] = details;
          return flat;
        });

        base.options[optionName] = formattedValues;
      }
    } else {
      // ✅ If options DON'T exist → process content fields properly
      if (product?.content) {
        const details = {};
        const content = product.content;

        // Process each field in content
        for (const [rawKey, val] of Object.entries(content)) {
          if (val === undefined || val === null) continue;

          const normKey = normalizeKey(rawKey);

          console.log(normKey)
          if (["corten_dimensions", "factory_id"].includes(normKey)) continue;

          // Handle Weight array
          if (normKey === 'weight' && Array.isArray(val) && val.length > 0) {
            const weightObj = val[0];
            if (weightObj.value != null && weightObj.unit) {
              details["Weight"] = `${weightObj.value} ${weightObj.unit}`;
            }
            continue;
          }

          // Handle Dimensions array
          if (normKey === 'dimensions' && Array.isArray(val) && val.length > 0) {
            const dimObj = val[0];
            const h = dimObj.height;
            const w = dimObj.width;
            const d = dimObj.depth;
            const unit = dimObj.unit;

            if (h != null && w != null) {
              const parts = [h, w];
              if (d != null) parts.push(d);
              const key = `Carton Dimensions${unit ? ` ${unit.toUpperCase()}` : ''}`;
              const value = `${parts.join(' x ')}${unit ? ` ${unit.toLowerCase()}` : ''}`;
              details[key] = value;
            }
            continue;
          }

          // Handle Lead Time array
          if (normKey === 'lead_time' && Array.isArray(val) && val.length > 0) {
            const leadObj = val[0];
            if (leadObj.min_days != null) {
              details["Lead Time Min Days"] = leadObj.min_days;
            }
            if (leadObj.max_days != null) {
              details["Lead Time Max Days"] = leadObj.max_days;
            }
            continue;
          }

          // Handle FLC Quantity array
          if (normKey === 'flc_quantity' && Array.isArray(val) && val.length > 0) {
            const flcObj = val[0];
            if (flcObj["20_ft_"] != null) {
              details["Flc Quantity 20 FT"] = flcObj["20_ft_"];
            }
            if (flcObj["40_ft_hc"] != null) {
              details["Flc Quantity 40 FT HC"] = flcObj["40_ft_hc"];
            }
            continue;
          }

          // Handle other fields using mapping or prettify
          if (keyMapping[normKey]) {
            details[keyMapping[normKey]] = val;
          } else if (!['factory', 'unit_quantity', 'unit_quantity_fr', 'minimum_quantity', 'is_new', 'featured'].includes(normKey)) {
            // Skip fields that are already handled in base object
            details[prettifyKey(rawKey)] = val;
          }
        }

        base.product_details = details;
      }
    }

    return base;
  };

  return Array.isArray(products)
    ? products.map(transform)
    : transform(products);
};