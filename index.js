import { Input, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const env = process.env.NODE_ENV || "dev";

let db_table_name = "new_products_dup";
let db_category_table_name = "extra_data_bot";
let cloudinary_folder = "new_products";
let deleted_products_table = "deleted_products_dup";

if (env === "prod") {
  // set variables for development
  db_table_name = "new_products_prod";
  db_category_table_name = "extra_data_dup";
  cloudinary_folder = "new_products_dup";
}

const baseCategorySortOrder = {
  4: 1,
  3: 2,
  2: 3,
  6: 4,
  5: 5,
  7: 6,
  8: 7,
  9: 8,
};

let categroyLetterName = {};

const supabaseUrl = "https://yhwkufhmqkrpaaahzblb.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlod2t1ZmhtcWtycGFhYWh6YmxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTcwMjA3NDUsImV4cCI6MjAxMjU5Njc0NX0.1Q1zgoQe_g5Ci3yKU70LO0XP5JbbZznvHxKyqz8yAcs";
const supabase = createClient(supabaseUrl, supabaseKey);

// fetch category name and letter
async function updateLocalCategoryList() {
  const { data: categoryData, error: categoryError } = await supabase
    .from(db_category_table_name)
    .select("*");

  if (categoryError) {
    console.error("Error fetching categories:", categoryError.message);
  } else if (categoryData) {
    categoryData.forEach((cat) => {
      categroyLetterName[cat.category] = cat.name;
    });
  }
}

updateLocalCategoryList();

bot.command("get", async (ctx) => {
  const productId = ctx.message.text.split(" ")[1];
  const { data, error } = await supabase
    .from(db_table_name)
    .select("*")
    .eq("id", productId)
    .single();

  if (error) {
    console.error("Error fetching product:", error.message);
    if (error.details && error.details.includes("0 rows")) {
      ctx.reply("No product found with that ID.");
      return;
    } else if (
      error.details &&
      error.details.includes("invalid input syntax for type bigint")
    ) {
      console.error("Invalid product ID:", productId);
      ctx.reply("Invalid product ID.");
      return;
    }

    ctx.reply("Error fetching product details.", error.message);
  } else if (data) {
    const { id, name, photo_url, price, disc_price, category, cat_sort } = data;
    ctx.replyWithPhoto(Input.fromURLStream(photo_url), {
      caption: `Product ID: ${id}\nName: ${name}\nCategory: ${categroyLetterName[category]} - ${cat_sort}\nPrice: ${price}\nDiscounted Price: ${disc_price}`,
    });
  }
});

// Command to update product price
bot.command("cp", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const productId = params[1];
  const newPrice = params[2];
  const newNoDiscountPrice = newPrice * 2;

  const { data, error } = await supabase
    .from(db_table_name)
    .update({ disc_price: newPrice, price: newNoDiscountPrice })
    .eq("id", productId)
    .single();

  if (error) {
    if (error.details && error.details.includes("0 rows")) {
      console.error("Product not found with id:", productId);
      ctx.reply("No product found with that ID.");
      return;
    } else if (
      error.details &&
      error.details.includes("invalid input syntax for type bigint")
    ) {
      console.error("Invalid price value:", newPrice);
      ctx.reply("Invalid price value.");
      return;
    }

    console.error("Error updating price:", error.message);
    ctx.reply("Error updating product price.");
  } else {
    ctx.reply(
      `Price updated for product ID ${productId}. New price: ${newPrice}`
    );
  }
});
// Command to update product name
bot.command("cn", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const productId = params[1];
  const newName = params.join(" ").split(" ").slice(2).join(" ");

  const { data, error } = await supabase
    .from(db_table_name)
    .update({ name: newName })
    .eq("id", productId)
    .single();

  if (error) {
    if (error.details && error.details.includes("0 rows")) {
      console.error("Product not found with id:", productId);
      ctx.reply("No product found with that ID.");
      return;
    } else if (
      error.details &&
      error.details.includes("invalid input syntax for type bigint")
    ) {
      console.error("Invalid product ID:", productId);
      ctx.reply("Invalid product ID.");
      return;
    }
    console.error("Error updating name:", error.message);
    ctx.reply("Error updating product name.");
  } else {
    ctx.reply(`Name updated for product ID ${productId}. New name: ${newName}`);
  }
});

function updateImage(ctx, productId, fileLink) {
  // Upload the image to Cloudinary
  cloudinary.uploader.upload(
    fileLink.href,
    {
      folder: cloudinary_folder,
    },
    async (error, result) => {
      if (error) {
        console.error("Cloudinary Upload Error:", error);
        ctx.reply("Error uploading image.");
        return;
      }

      // Get the Cloudinary URL and update Supabase
      const imageUrl = result.secure_url;

      // Update the product image in Supabase
      const { data, error: supabaseError } = await supabase
        .from(db_table_name)
        .update({ photo_url: imageUrl })
        .eq("id", productId)
        .single();

      if (supabaseError) {
        console.error(
          "Error updating image in Supabase:",
          supabaseError.message
        );
        ctx.reply("Error updating product image.");
      } else {
        ctx.reply(`Image updated for product ID ${productId}.`);
      }
    }
  );
}

function addNewProduct(
  ctx,
  fileLink,
  productCategory,
  productPrice,
  productName
) {
  // Upload the image to Cloudinary
  cloudinary.uploader.upload(
    fileLink.href,
    {
      folder: cloudinary_folder,
    },
    async (error, result) => {
      if (error) {
        console.error("Cloudinary Upload Error:", error);
        ctx.reply("Error uploading image.");
        return;
      }

      // Get the Cloudinary URL and update Supabase
      const imageUrl = result.secure_url;

      // to add the position of the new product in the category, we need to get the current count of products in the category
      const { data: categoryData, error: categoryError } = await supabase
        .from(db_category_table_name)
        .select("prcount")
        .eq("category", productCategory)
        .single();

      if (categoryError) {
        console.error("Error fetching category:", categoryError.message);
        ctx.reply("Error fetching category details.");
        return;
      }

      const newProductCount = categoryData.prcount + 1;

      // Insert the new product into the new_products table
      const { data, error: supabaseError } = await supabase
        .from(db_table_name)
        .insert([
          {
            name: productName,
            disc_price: productPrice,
            price: productPrice * 2,
            category: productCategory,
            photo_url: imageUrl,
            cat_sort: newProductCount,
          },
        ]);

      if (supabaseError) {
        console.error("Error adding product:", supabaseError.message);
        ctx.reply("Error adding product.");
      } else {
        // Update the product count in the category
        const { data: updatedCategoryData, error: updateError } = await supabase
          .from(db_category_table_name)
          .update({ prcount: newProductCount })
          .eq("category", productCategory)
          .single();

        if (updateError) {
          console.error("Error updating category:", updateError.message);
          ctx.reply("Error updating category details.");
        } else {
          ctx.reply("Product added successfully.");
        }
      }
    }
  );
}

// Handle image upload
bot.on("photo", async (ctx) => {
  ctx.reply("Uploading image...");
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; // Get the highest resolution photo
  // Get the file URL from Telegram
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const params = ctx.message.caption.split(" ");
  const command = params[0];

  if (command === "/ci") {
    const productId = params[1];
    if (productId === undefined) {
      ctx.reply("Please provide a product ID.");
      return;
    }
    updateImage(ctx, productId, fileLink);
  } else if (command === "/add") {
    const productCategory = params[1];
    const productPrice = params[2];
    const productName = params.slice(3).join(" ");
    addNewProduct(ctx, fileLink, productCategory, productPrice, productName);
  }
});

bot.command("getcat", async (ctx) => {
  const { data, error } = await supabase
    .from(db_category_table_name)
    .select("*");

  if (error) {
    console.error("Error fetching categories:", error.message);
    ctx.reply("Error fetching categories.");
  } else if (data) {
    // show category id - order - name, order by order
    const categories = data
      .map(
        (cat) =>
          `${cat.order}) ${cat.id} - ${cat.category} - ${cat.name} (${cat.prcount})`
      )
      .sort(
        (a, b) => parseInt(a.split(" - ")[0]) - parseInt(b.split(" - ")[0])
      );
    ctx.reply("Categories\n\n\t\t\t\tId - Name\n" + categories.join("\n"));
  }
});

// command to update category name
bot.command("ccn", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const categoryId = params[1];
  const newName = params.join(" ").split(" ").slice(2).join(" ");

  const { data, error } = await supabase
    .from(db_category_table_name)
    .update({ name: newName })
    .eq("id", categoryId)
    .single();

  if (error) {
    if (error.details && error.details.includes("0 rows")) {
      console.error("Category not found with id:", categoryId);
      ctx.reply("No category found with that ID.");
      return;
    }
    console.error("Error updating category name:", error.message);
    ctx.reply("Error updating category name.");
  } else {
    ctx.reply(
      `Name updated for category ID ${categoryId}. New name: ${newName}`
    );
  }
});

// change category order, can only swap with another category
bot.command("cco", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const categoryId = params[1];
  const swapCategoryId = params[2];

  const { data: category1, error: category1Error } = await supabase
    .from(db_category_table_name)
    .select("*")
    .eq("id", categoryId)
    .single();

  const { data: category2, error: category2Error } = await supabase
    .from(db_category_table_name)
    .select("*")
    .eq("id", swapCategoryId)
    .single();

  if (category1Error) {
    if (category1Error.details.includes("0 rows")) {
      console.error("Category not found with id:", categoryId);
      ctx.reply("No category found with that ID.");
      return;
    }
    console.error("Error fetching category:", category1Error.message);
    ctx.reply("Error fetching category details.");
  } else if (category2Error) {
    if (category2Error.details.includes("0 rows")) {
      console.error("Category not found with id:", swapCategoryId);
      ctx.reply("No category found with that ID.");
      return;
    }
    console.error("Error fetching category:", category2Error.message);
    ctx.reply("Error fetching category details.");
  }

  const { order: order1 } = category1;
  const { order: order2 } = category2;

  const { data: updatedCategory1, error: updateError1 } = await supabase
    .from(db_category_table_name)
    .update({ order: order2 })
    .eq("id", categoryId)
    .single();

  const { data: updatedCategory2, error: updateError2 } = await supabase
    .from(db_category_table_name)
    .update({ order: order1 })
    .eq("id", swapCategoryId)
    .single();

  if (updateError1) {
    console.error("Error updating category order:", updateError1.message);
    ctx.reply("Error updating category order.");
  } else if (updateError2) {
    console.error("Error updating category order:", updateError2.message);
    ctx.reply("Error updating category order.");
  } else {
    ctx.reply(
      `Order updated for category ID ${categoryId} and ${swapCategoryId}.`
    );
  }
});

// if messes the category order, /resetco will reset the category order
bot.command("resetco", async (ctx) => {
  const { data, error } = await supabase
    .from(db_category_table_name)
    .select("*");

  if (error) {
    console.error("Error fetching categories:", error.message);
    ctx.reply("Error fetching categories.");
  } else if (data) {
    const updatedCategories = data.map((cat) => {
      return {
        ...cat,
        order: baseCategorySortOrder[cat.id],
      };
    });

    const { data: updatedData, error: updateError } = await supabase
      .from(db_category_table_name)
      .upsert(updatedCategories);

    if (updateError) {
      console.error("Error updating category order:", updateError.message);
      ctx.reply("Error updating category order.");
    } else {
      ctx.reply("Category order reset.");
    }
  }
});

// command to swap product order (sort_order) with another product
bot.command("cso", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const productId = params[1];
  const swapProductId = params[2];

  const { data: product1, error: product1Error } = await supabase
    .from(db_table_name)
    .select("*")
    .eq("id", productId)
    .single();

  const { data: product2, error: product2Error } = await supabase
    .from(db_table_name)
    .select("*")
    .eq("id", swapProductId)
    .single();

  if (product1Error) {
    if (product1Error.details.includes("0 rows")) {
      console.error("Product not found with id:", productId);
      ctx.reply("No product found with that ID.");
      return;
    }
    console.error("Error fetching product:", product1Error.message);
    ctx.reply("Error fetching product details.");
  } else if (product2Error) {
    if (product2Error.details.includes("0 rows")) {
      console.error("Product not found with id:", swapProductId);
      ctx.reply("No product found with that ID.");
      return;
    }
    console.error("Error fetching product:", product2Error.message);
    ctx.reply("Error fetching product details.");
  }

  const { cat_sort: sort1 } = product1;
  const { cat_sort: sort2 } = product2;

  const { data: updatedProduct1, error: updateError1 } = await supabase
    .from(db_table_name)
    .update({ cat_sort: sort2 })
    .eq("id", productId)
    .single();

  const { data: updatedProduct2, error: updateError2 } = await supabase
    .from(db_table_name)
    .update({ cat_sort: sort1 })
    .eq("id", swapProductId)
    .single();

  if (updateError1) {
    console.error("Error updating product order:", updateError1.message);
    ctx.reply("Error updating product order.");
  } else if (updateError2) {
    console.error("Error updating product order:", updateError2.message);
    ctx.reply("Error updating product order.");
  } else {
    ctx.reply(
      `Order updated for product ID ${productId} and ${swapProductId}.`
    );
  }
});

// Command to add a new category
bot.command("addcat", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const categoryLetter = params[1];
  const categoryName = params.slice(2).join(" ");

  // get count of categories to set the order
  const { data: categoryData, error: categoryError } = await supabase
    .from(db_category_table_name)
    .select("*");

  if (categoryError) {
    console.error("Error fetching categories:", categoryError.message);
    ctx.reply("Error fetching categories.");
    return;
  }

  const newCategoryCount = categoryData.length + 1;

  const { data, error } = await supabase.from(db_category_table_name).insert([
    {
      category: categoryLetter,
      name: categoryName,
      order: newCategoryCount,
      prcount: 0,
    },
  ]);

  if (error) {
    console.error("Error adding category:", error.message);
    ctx.reply("Error adding category.");
  } else {
    ctx.reply("Category added successfully.");
  }
});

// update product category
bot.command("cpc", async (ctx) => {
  const params = ctx.message.text.split(" ");
  const productId = params[1];
  const newCategory = params[2];

  const { data: product, error: productError } = await supabase
    .from(db_table_name)
    .select("*")
    .eq("id", productId);

  if (productError) {
    if (productError.details && productError.details.includes("0 rows")) {
      console.error("Product not found with id:", productId);
      ctx.reply("No product found with that ID.");
      return;
    }
    console.error("Error fetching product:", productError.message);
    ctx.reply("Error fetching product details.");
  }

  // for category, check locally from the category list
  if (categroyLetterName[newCategory] === undefined) {
    console.error("Invalid category:", newCategory);
    ctx.reply("Invalid category.");
    return;
  }

  const { data: updatedProduct, error: updateError } = await supabase
    .from(db_table_name)
    .update({ category: newCategory })
    .eq("id", productId)
    .single();

  if (updateError) {
    console.error("Error updating category:", updateError.message);
    ctx.reply("Error updating category.");
  } else {
    // update the category count in the old category
    const { data: oldCategoryData, error: oldCategoryError } = await supabase
      .from(db_category_table_name)
      .select("prcount")
      .eq("category", product[0].category)
      .single();

    if (oldCategoryError) {
      console.error("Error fetching category:", oldCategoryError.message);
      ctx.reply("Error fetching category details.");
      return;
    }

    const oldCategoryCount = oldCategoryData.prcount - 1;

    const { data: updatedOldCategoryData, error: updateOldCategoryError } =
      await supabase
        .from(db_category_table_name)
        .update({ prcount: oldCategoryCount })
        .eq("category", product[0].category)
        .single();

    if (updateOldCategoryError) {
      console.error("Error updating category:", updateOldCategoryError.message);
      ctx.reply("Error updating category details.");
      return;
    }

    // update the category count in the new category
    const { data: newCategoryData, error: newCategoryError } = await supabase
      .from(db_category_table_name)
      .select("prcount")
      .eq("category", newCategory)
      .single();

    if (newCategoryError) {
      console.error("Error fetching category:", newCategoryError.message);
      ctx.reply("Error fetching category details.");
      return;
    }

    const newCategoryCount = newCategoryData.prcount + 1;

    const { data: updatedNewCategoryData, error: updateNewCategoryError } =
      await supabase
        .from(db_category_table_name)
        .update({ prcount: newCategoryCount })
        .eq("category", newCategory)
        .single();

    if (updateNewCategoryError) {
      console.error("Error updating category:", updateNewCategoryError.message);
      ctx.reply("Error updating category details.");
      return;
    }

    ctx.reply(
      `Category updated for product ID ${productId}. New category: ${categroyLetterName[newCategory]}`
    );
  }
});

// Command to delete a product
// The product will be moved to the deleted_products table for backup
bot.command("delete", async (ctx) => {
  const productId = ctx.message.text.split(" ")[1];

  // Fetch the product details
  const { data: product, error: productError } = await supabase
    .from(db_table_name)
    .select("*")
    .eq("id", productId)
    .single();

  if (productError) {
    if (productError.details && productError.details.includes("0 rows")) {
      console.error("Product not found with id:", productId);
      ctx.reply("No product found with that ID.");
      return;
    }
    console.error("Error fetching product:", productError.message);
    ctx.reply("Error fetching product details.");
  }

  // Insert the product into the deleted_products table
  const { data: deletedProduct, error: deletedProductError } = await supabase
    .from(deleted_products_table)
    .insert(product);

  if (deletedProductError) {
    console.error("Error deleting product:", deletedProductError.message);
    ctx.reply("Error deleting product.");
  }

  // Delete the product from the new_products table
  const { data: deleted, error: deleteError } = await supabase
    .from(db_table_name)
    .delete()
    .eq("id", productId);

  if (deleteError) {
    console.error("Error deleting product:", deleteError.message);
    ctx.reply("Error deleting product.");
  } else {
    ctx.reply(`Product ID ${productId} deleted.`);
  }
});

// Command to view deleted products as list (ID - Name - Price)
bot.command("vdeleted", async (ctx) => {
  const { data, error } = await supabase
    .from(deleted_products_table)
    .select("*");

  if (error) {
    console.error("Error fetching deleted products:", error.message);
    ctx.reply("Error fetching deleted products.");
  } else if (data) {
    if (data.length === 0) {
      ctx.reply("No deleted products.");
      return;
    }
    const deletedProducts = data
      .map((product) => `${product.id} - ${product.name} - ${product.price}`)
      .join("\n");
    ctx.reply("Deleted Products\n\nId - Name - Price\n" + deletedProducts);
  }
});

// Command to restore a deleted product
bot.command("restore", async (ctx) => {
  const productId = ctx.message.text.split(" ")[1];

  // Fetch the product details
  const { data: product, error: productError } = await supabase
    .from(deleted_products_table)
    .select("*")
    .eq("id", productId)
    .single();

  if (productError) {
    if (productError.details && productError.details.includes("0 rows")) {
      console.error("Product not found with id:", productId);
      ctx.reply("No product found with that ID.");
      return;
    }
    console.error("Error fetching product:", productError.message);
    ctx.reply("Error fetching product details.");
  }

  // Insert the product into the new_products table
  const { data: restoredProduct, error: restoredProductError } = await supabase
    .from(db_table_name)
    .insert(product);

  if (restoredProductError) {
    console.error("Error restoring product:", restoredProductError.message);
    ctx.reply("Error restoring product.");
  }

  // Delete the product from the deleted_products table
  const { data: deleted, error: deleteError } = await supabase
    .from(deleted_products_table)
    .delete()
    .eq("id", productId);

  if (deleteError) {
    console.error("Error deleting product:", deleteError.message);
    ctx.reply("Error deleting product.");
  } else {
    ctx.reply(`Product ID ${productId} restored.`);
  }
});

// command to update local category list
bot.command("updatecat", async (ctx) => {
  updateLocalCategoryList();
  ctx.reply("Category list updated.");
});

bot.on(message("text"), async (ctx) => {
  // Explicit usage
  await ctx.telegram.sendMessage(
    ctx.message.chat.id,
    //  formatted help list of commands
    `Commands:

    Product Commands:
    /get [product_id] - Get product details
    /cp [product_id] [new_price] - Change product price
    /cn [product_id] [new_name] - Change product name
    /cpc [product_id] [new_category] - Change product category
    /ci [product_id] - Change product image
    /cso [product_id] [swap_product_id] - Change product sort order (swap location with another product)
    /delete [product_id] - Delete product

    Category Commands:
    /add [category] [price] [name] - Add new product (with image)
    /getcat - Get category list
    /addcat [category_letter] [category_name] - Add new category
    /ccn [category_id] [new_name] - Change category name
    /cco [category_id] [swap_category_id] - Change category order
    /resetco - Reset category order to default

    Deleted Products:
    /vdeleted - View deleted products
    /restore [product_id] - Restore deleted product
    
    Other Commands:
    /updatecat - Update local category list
    `
  );
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
