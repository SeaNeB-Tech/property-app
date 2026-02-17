import React, { useEffect, useState } from "react";
import Image from "next/image";
import { getProducts } from "@/services/pro.service";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getProducts();
        setProducts(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err?.message || "Unable to load products.");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"></div>
          <p className="font-medium text-gray-700">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        <p className="text-base font-semibold">Could not load products</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-10 text-center text-blue-800">
        <p className="mb-2 text-xl font-semibold">No Products Available</p>
        <p className="text-sm text-blue-700">You do not have any products yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Total: {products.length} product{products.length !== 1 ? "s" : ""}
        </p>
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          Active Catalog
        </span>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.product_id || product.id || product._id} product={product} />
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({ product }) => {
  const productName = product.product_name || product.name || product.title || "Untitled";
  const isActive = product.status === "active" || product.status === "available";

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl">
      <div className="mb-4">
        {product.image && (
          <div className="relative h-44 w-full overflow-hidden rounded-xl ring-1 ring-black/5">
            <Image
              src={product.image}
              alt={productName}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        )}
      </div>

      <h3 className="mb-2 line-clamp-1 text-xl font-semibold text-slate-900">{productName}</h3>

      {product.description && (
        <p className="mb-4 min-h-10 line-clamp-2 text-sm text-slate-600">{product.description}</p>
      )}

      {product.price && (
        <p className="mb-3 text-lg font-bold text-emerald-700">
          INR {Number(product.price).toLocaleString("en-IN")}
        </p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {product.category && (
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
            {product.category}
          </span>
        )}
        {product.status && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
            }`}
          >
            {product.status}
          </span>
        )}
      </div>

      <button className="mt-auto w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-md">
        View Details
      </button>
    </article>
  );
};

export default ProductList;
