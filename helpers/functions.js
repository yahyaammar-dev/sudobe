exports.transformProducts = (products) => {
    const transform = (product) => {
      const base = {
        name: product.name || null,
        description: product.description || null,
        images: Array.isArray(product?.images)
          ? product.images.map(img => img?.file?.url).filter(Boolean)
          : [],
        price: product.price || null,
        unit_quantity: product.content?.unit_quantity || null,
        moq: product.content?.minimum_quantity || null,
        sold_by: product.content?.factory?.name || product?.sold_by || null,
        is_new: product.content?.is_new || false,
        featured: product.content?.featured || false,
        weight: product.content?.weight?.[0]?.value || null,
        weight_unit: product.content?.weight?.[0]?.unit || null,
        discounted_price: product.discounted_price || null,
        discount_percent: product.discount_percent || null,
        type: product.type || null
      };
  
      // Handle dynamic options like "Size"
      if (Array.isArray(product.options)) {
        for (const option of product.options) {
          const optionKey = option.name; // e.g., "Size"
          if (!Array.isArray(option.values)) continue;
  
          base[optionKey] = option.values.map((value) => {
            const flat = {};
  
            for (const [key, val] of Object.entries(value)) {
              if (Array.isArray(val) && val.length && typeof val[0] === "object") {
                // It's an array of objects like flc_quantity or lead_time
                val.forEach(obj => {
                  for (const [subKey, subVal] of Object.entries(obj)) {
                    if (subKey !== "id") {
                      flat[`${key}_${subKey}`] = subVal;
                    }
                  }
                });
              } else {
                // Normal key-value
                flat[key] = val;
              }
            }
  
            return flat;
          });
        }
      }
  
      return base;
    };
  
    return Array.isArray(products)
      ? products.map(transform)
      : transform(products);
  };
  