import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  ShieldCheck,
  CalendarClock,
  ArrowRight,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import api from '../api/axios';
import ProductCard from '../components/ProductCard';
import SkeletonCard from '../components/SkeletonCard';

export default function HomePage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heroSearch, setHeroSearch] = useState('');

  useEffect(() => {
    const loadHome = async () => {
      try {
        setLoading(true);
        const [catRes, featRes, dealsRes] = await Promise.all([
          api.get('/categories'),
          api.get('/products', { params: { featured: 'true', limit: 8 } }),
          api.get('/products', { params: { deals: 'true', limit: 8 } }),
        ]);
        setCategories(catRes.data.categories || []);
        setFeatured(featRes.data.products || []);
        setDeals(dealsRes.data.products || []);
      } catch (_err) {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    };
    loadHome();
  }, []);

  const handleHeroSearch = (e) => {
    e.preventDefault();
    const q = heroSearch.trim();
    navigate(q ? `/catalog?search=${encodeURIComponent(q)}` : '/catalog');
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-content">
            <span className="hero-pill">
              <Sparkles size={15} /> Smart 2-Hour Delivery Time Slots
            </span>
            <h1>
              Stop waiting all day. Pick the <span>exact 2-hour window</span> your parcel arrives.
            </h1>
            <p>
              Other stores only give you a vague delivery date. SlotKart lets you book live
              capacity-controlled 2-hour IST windows, get smart slot recommendations, and verify
              every handover with a 4-digit OTP.
            </p>

            <form className="hero-search-bar" onSubmit={handleHeroSearch}>
              <Search size={19} className="search-icon" />
              <input
                type="text"
                placeholder="What are you shopping for today?"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Explore Catalog <ArrowRight size={16} />
              </button>
            </form>

            <div className="hero-trust-row">
              <span>
                <Clock size={16} /> 5 Daily 2-Hr Windows
              </span>
              <span>
                <ShieldCheck size={16} /> 4-Digit OTP Handover
              </span>
              <span>
                <CalendarClock size={16} /> Reschedule Instead of Return
              </span>
            </div>
          </div>

          <div className="hero-visual-card">
            <div className="hero-slot-preview">
              <div className="hero-preview-header">
                <span className="badge badge-emerald-solid">Live Python Slot Engine</span>
                <small>Pincode 302001</small>
              </div>
              <h4>Arriving Friday, 14 Nov between 2:00 PM &ndash; 4:00 PM</h4>
              <div className="hero-mini-slots">
                <div className="hero-mini-slot">
                  <span>10:00 AM - 12:00 PM</span>
                  <span className="slot-status-pill slot-status-fast">Filling fast (4/5)</span>
                </div>
                <div className="hero-mini-slot active">
                  <span>2:00 PM - 4:00 PM</span>
                  <span className="slot-status-pill slot-status-open">Recommended (1/5)</span>
                </div>
                <div className="hero-mini-slot disabled">
                  <span>6:00 PM - 8:00 PM</span>
                  <span className="slot-status-pill slot-status-full">Full (5/5)</span>
                </div>
              </div>
              <div className="hero-preview-footer">
                <span>Handover OTP: <strong>4829</strong></span>
                <Link to="/catalog" className="text-link">
                  Try checkout &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Chips */}
      <section className="container page-section-sm">
        <div className="section-heading-row">
          <h2>Shop by Category</h2>
          <Link to="/catalog" className="text-link">
            Browse all 36 products &rarr;
          </Link>
        </div>
        <div className="category-chips-row">
          <Link to="/catalog" className="category-chip active">
            All Categories
          </Link>
          {categories.map((cat) => (
            <Link key={cat._id} to={`/catalog?category=${cat.slug}`} className="category-chip">
              {cat.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="container page-section-sm">
        <div className="section-heading-row">
          <div>
            <h2>Featured Picks</h2>
            <p className="text-muted">Top-rated products eligible for 2-hour scheduled delivery.</p>
          </div>
          <Link to="/catalog?sort=rating" className="btn btn-outline btn-sm">
            View All <ArrowRight size={15} />
          </Link>
        </div>

        <div className="product-grid">
          {loading
            ? [1, 2, 3, 4].map((n) => <SkeletonCard key={n} />)
            : featured.map((prod) => <ProductCard key={prod._id} product={prod} />)}
        </div>
      </section>

      {/* How Smart Slots Work Banner */}
      <section className="container page-section-sm">
        <div className="usp-banner">
          <div className="usp-step">
            <span className="usp-num">01</span>
            <h4>Pick Your 2-Hour Window</h4>
            <p>
              Choose any of the next 7 days and pick an open 2-hour slot or follow our Python
              engine&apos;s Recommended least-loaded slot.
            </p>
          </div>
          <div className="usp-step">
            <span className="usp-num">02</span>
            <h4>Live Capacity &amp; Flex Reschedule</h4>
            <p>
              Atomic slot capacity prevents delivery overload. Plans changed? Reschedule up to 2
              times before the 3-hour cutoff.
            </p>
          </div>
          <div className="usp-step">
            <span className="usp-num">03</span>
            <h4>OTP Verified Doorstep Handover</h4>
            <p>
              Share your 4-digit OTP when the partner arrives — or use &ldquo;Reschedule instead of
              Return&rdquo; if you step away.
            </p>
          </div>
        </div>
      </section>

      {/* Hot Deals */}
      <section className="container page-section">
        <div className="section-heading-row">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={22} className="text-indigo" /> Today&apos;s Best Deals
            </h2>
            <p className="text-muted">Limited-time savings across Electronics, Fashion &amp; Home.</p>
          </div>
          <Link to="/catalog?deals=true" className="btn btn-outline btn-sm">
            All Deals <ArrowRight size={15} />
          </Link>
        </div>

        <div className="product-grid">
          {loading
            ? [1, 2, 3, 4].map((n) => <SkeletonCard key={n} />)
            : deals.map((prod) => <ProductCard key={prod._id} product={prod} />)}
        </div>
      </section>
    </div>
  );
}
