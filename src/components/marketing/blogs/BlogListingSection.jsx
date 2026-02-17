"use client";

import { useMemo, useState } from "react";
import BlogCard from "@/components/marketing/cards/BlogCard";

const PER_PAGE = 6;

/**
 * Blog listing UI with search, category filtering, and pagination.
 */
export default function BlogListingSection({ categories = [], posts = [], popular = [], newsletter }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchQuery = `${post.title} ${post.excerpt}`.toLowerCase().includes(query.toLowerCase());
      const matchCategory = activeCategory === "All" || post.category === activeCategory;
      return matchQuery && matchCategory;
    });
  }, [posts, query, activeCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PER_PAGE));

  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return filteredPosts.slice(start, start + PER_PAGE);
  }, [filteredPosts, currentPage]);

  function handleCategoryChange(category) {
    setActiveCategory(category);
    setCurrentPage(1);
  }

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search blogs by keyword"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-amber-600"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => handleCategoryChange(category)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  activeCategory === category
                    ? "bg-amber-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-amber-500"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {paginatedPosts.map((post) => (
            <BlogCard key={`${post.title}-${post.category}`} blog={post} />
          ))}
        </div>
        {paginatedPosts.length === 0 ? <p className="mt-6 text-sm text-slate-600">No posts found for selected filters.</p> : null}

        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h3 className="text-xl font-bold text-slate-900">Popular posts</h3>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          {popular.map((post) => (
            <BlogCard key={post.title} blog={post} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7">
          <h3 className="text-2xl font-bold text-slate-900">{newsletter.title}</h3>
          <p className="mt-2 text-sm text-slate-700">{newsletter.description}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="Enter email"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-amber-600"
            />
            <button type="button" className="h-11 rounded-xl bg-amber-700 px-5 text-sm font-semibold text-white hover:bg-amber-600">
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
