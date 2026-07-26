import { z } from "zod";

const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  materialId: z.string().min(1, "Material is required"),
  qty: z.number().positive("Quantity must be positive"),
  unit: z.enum(["KG", "Ton", "Munn"]),
  rate: z.number().positive("Rate must be positive"),
});

const salesOrderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  productId: z.string().min(1, "Product is required"),
  qty: z.number().positive("Quantity must be positive"),
  rate: z.number().positive("Rate must be positive"),
});

const rawMaterialSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  stockKg: z.number().min(0, "Stock cannot be negative"),
});
