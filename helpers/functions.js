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
      featured: product.content?.featured || false,
      weight: product.content?.weight?.[0]?.value || null,
      weight_unit: product.content?.weight?.[0]?.unit || null,
      discounted_price: product.discounted_price || null,
      discount_percent: product.discount_percent || null,
      type: product.type || null,
      options: {},
    };

    if (Array.isArray(product.options)) {
      for (const option of product.options) {
        const optionName = option.name;
        if (!Array.isArray(option.values)) continue;

        const formattedValues = option.values.map((value) => {
          const flat = {};
          const details = {};

          for (const [key, val] of Object.entries(value)) {
            const prettyKey = prettifyKey(key);

            // Core fields to keep outside product_details
            if (["id", "name", "price", "shipment_weight", "description", "lead_time_min_days", "lead_time_max_days", "minimum_quantity"].includes(key.toLowerCase())) {
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
    }

    return base;
  };

  return Array.isArray(products)
    ? products.map(transform)
    : transform(products);
};
