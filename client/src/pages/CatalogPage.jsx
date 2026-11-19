import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/axios';
import ProductCard from '../components/ProductCard';
import SkeletonCard from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const sort = searchParams.get('sort') || 'newest';
  const deals = searchParams.get('deals') || '';
  const page = Number(searchParams.get('page') || 1);

  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    api
      .get('/categories')
      .then((res) => setCategories(res.data.categories || []))
      .catch(() => {});
  }, []);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next);
  };

  const resetFilters = () => {
    setLocalSearch('');
    setSearchParams({});
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/products', {
        params: {
          search: search || undefined,
          category: category || undefined,
          minPrice: minPrice || undefined,
          maxPrice: maxPrice || undefined,
          sort,
          deals: deals || undefined,
          page,
          limit: 12,
        },
      });
      setProducts(data.products || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (_err) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search, category, minPrice, maxPrice, sort, deals, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateParam('search', localSearch.trim());
  };

  return (
    <div className="container page-section">
      <div className="catalog-top-bar">
        <div>
          <h1>Product Catalog</h1>
          <p className="text-muted">
            Showing {products.length} of {pagination.total} products &bull; All eligible for 2-hour
            slot delivery
          </p>
        </div>

        <form className="catalog-search-form" onSubmit={handleSearchSubmit}>
          <div className="input-with-icon">
            <Search size={16} className="input-icon" />
            <input
              type="text"
              placeholder="Filter by keyword or brand..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Apply
          </button>
        </form>
      </div>

      <div className="catalog-layout">
        {/* Sidebar Filters */}
        <aside className="card catalog-filters">
          <div className="card-header-row" style={{ marginBottom: '1rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <SlidersHorizontal size={16} /> Filters
            </h3>
            <button type="button" className="text-link-btn" onClick={resetFilters}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>

          <div className="filter-group">
            <label>Category</label>
            <div className="filter-cat-list">
              <button
                type="button"
                className={`filter-cat-btn ${!category ? 'active' : ''}`}
                onClick={() => updateParam('category', '')}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  type="button"
                  className={`filter-cat-btn ${category === cat.slug ? 'active' : ''}`}
                  onClick={() => updateParam('category', cat.slug)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Price Range (INR)</label>
            <div className="price-inputs-row">
              <input
                type="number"
                min="0"
                placeholder="Min ₹"
                value={minPrice}
                onChange={(e) => updateParam('minPrice', e.target.value)}
              />
              <span>&ndash;</span>
              <input
                type="number"
                min="0"
                placeholder="Max ₹"
                value={maxPrice}
                onChange={(e) => updateParam('maxPrice', e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="catalog-sort">Sort By</label>
            <select
              id="catalog-sort"
              value={sort}
              onChange={(e) => updateParam('sort', e.target.value)}
            >
              <option value="newest">Newest Arrivals</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Customer Rating</option>
              <option value="discount">Biggest Discount</option>
            </select>
          </div>

          <label className="checkbox-row" style={{ marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={deals === 'true'}
              onChange={(e) => updateParam('deals', e.target.checked ? 'true' : '')}
            />
            <span>Show Top Deals only</span>
          </label>
        </aside>

        {/* Product Results */}
        <div className="catalog-results">
          {loading ? (
            <div className="product-grid product-grid-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <SkeletonCard key={n} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title="No matching products found"
              description="Try adjusting your search keywords, price range, or category filters."
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={resetFilters}>
                  Clear All Filters
                </button>
              }
            />
          ) : (
            <>
              <div className="product-grid product-grid-3">
                {products.map((prod) => (
                  <ProductCard key={prod._id} product={prod} />
                ))}
              </div>

              {pagination.totalPages > 1 && (
                <div className="pagination-bar">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={page <= 1}
                    onClick={() => updateParam('page', String(page - 1))}
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="pagination-info">
                    Page <strong>{pagination.page}</strong> of{' '}
                    <strong>{pagination.totalPages}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => updateParam('page', String(page + 1))}
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
