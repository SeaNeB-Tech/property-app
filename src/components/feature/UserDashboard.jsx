"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { getProducts } from "@/services/pro.service";
import { authStore } from "@/app/auth/auth-service/store/authStore";

const UserDashboard = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const fetchAllProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = authStore.getAccessToken();

        if (!token) {
          setError("Authentication required. Please log in again.");
          return;
        }

        const data = await getProducts();
        setProducts(data || []);
      } catch (err) {
        setError("Failed to load products. Please try again.");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllProducts();
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4 mx-auto"></div>
          <p className="text-gray-600 font-semibold">Loading products...</p>
          <p className="text-gray-500 text-sm mt-2">Please wait while we fetch your properties</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-red-700">Error Loading Products</h3>
            <p className="text-red-600 text-sm mt-2">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors font-medium whitespace-nowrap ml-4"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty-state bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg className="w-16 h-16 mx-auto text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-blue-700 mb-2">No Products Available</p>
        <p className="text-blue-600">No properties are currently available. Check back soon!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Available Properties</h2>
        <p className="text-gray-600">
          Explore {products.length} amazing property{products.length !== 1 ? "ies" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <ProductCard key={product.product_id || product.id} product={product} />
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({ product }) => {
  return (
    <div className="product-card bg-white rounded-lg shadow-md transition-all duration-200 overflow-hidden">
      {/* Image */}
      {product.image ? (
        <div className="relative w-full h-48 card-image">
          <Image
            src={product.image}
            alt={product.product_name || "Property"}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="w-full h-48 card-image flex items-center justify-center">
          <svg className="w-16 h-16 text-white opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 5h4" />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="card-content p-5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="product-title text-lg font-bold text-gray-800 flex-1">
            {product.product_name || "Property"}
          </h3>
          {product.product_key && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded ml-2 whitespace-nowrap">
              {product.product_key}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{product.description}</p>
        )}

        {product.price && (
          <div className="mb-3">
            <p className="product-price text-2xl font-bold">
              ₹ {product.price.toLocaleString("en-IN")}
            </p>
          </div>
        )}

        {product.location && (
          <p className="text-xs text-gray-500 mb-3 flex items-center">
            <span className="mr-1"></span>
            {product.location}
          </p>
        )}

        {product.status && (
          <div className="mb-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                product.status === "active" || product.status === "available"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {product.status === "active" ? "Available" : product.status}
            </span>
          </div>
        )}

        <button className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors font-medium">
          View Details
        </button>
      </div>
    </div>
  );
};

export default UserDashboard;
