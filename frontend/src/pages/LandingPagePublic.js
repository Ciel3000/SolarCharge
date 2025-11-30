// frontend/src/pages/LandingPagePublic.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // Import useLocation and useNavigate
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import { generateGoogleMapsUrl } from '../utils/mapUtils';

function LandingPage({ stations, loading, navigateTo }) {
  const { session, isAdmin } = useAuth(); // Get auth state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation(); // Get the location object to access state
  const navigate = useNavigate(); // Get navigate function
  
  // Location state
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbyStations, setNearbyStations] = useState([]);
  const [showAllStations, setShowAllStations] = useState(false);

  // Redirect if user is already logged in
  useEffect(() => {
    if (session) {
      // User is already logged in, redirect them
      const targetPath = isAdmin ? '/admin/dashboard' : '/home';
      navigate(targetPath, { replace: true });
    }
  }, [session, isAdmin, navigate]);

  // Effect to scroll to section if specified in location.state
  useEffect(() => {
    // Check if there's a 'scrollTo' property in the location state
    if (location.state?.scrollTo) {
      const element = document.getElementById(location.state.scrollTo);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        // Optional: Clear the state after scrolling to prevent re-scrolling
        // This can be tricky with React Router. For a one-time scroll,
        // it often works without explicit clearing, but if you notice
        // issues on subsequent renders, you might need a more robust state management
        // or clear it using navigate('/current-path', {replace: true, state: {}}).
      }
    }
  }, [location.state]); // Re-run this effect when location.state changes

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in kilometers
    return distance;
  };

  // Get user's current location
  const getUserLocation = () => {
    setLocationLoading(true);
    setLocationError('');
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setLocationLoading(false);
        
        // Calculate nearby stations
        if (stations && stations.length > 0) {
          const stationsWithDistance = stations.map(station => {
            // For now, we'll use a simple approach - stations with coordinates
            // In a real app, you'd store lat/lng in the database
            // For demo purposes, we'll generate random nearby coordinates
            const stationLat = station.latitude || (latitude + (Math.random() - 0.5) * 0.01);
            const stationLng = station.longitude || (longitude + (Math.random() - 0.5) * 0.01);
            const distance = calculateDistance(latitude, longitude, stationLat, stationLng);
            
            return {
              ...station,
              latitude: stationLat,
              longitude: stationLng,
              distance: distance
            };
          });
          
          // Sort by distance and take the closest 6
          const sortedStations = stationsWithDistance
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6);
          
          setNearbyStations(sortedStations);
        }
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access was denied. Please enable location services.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred while getting location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // The rest of your LandingPagePublic.js component remains the same
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Animated Background Orbs with brand colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Sun-colored orb */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
        {/* Lightning-colored orb */}
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        {/* Solar panel colored accent */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
        {/* Additional floating orbs */}
        <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl animate-float" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)' }}></div>
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl animate-float-delay" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, transparent 70%)' }}></div>
      </div>

      {/* Navigation Menu (This is just a placeholder; the main Navigation is in App.js) */}
      {/* <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">⚡</span>
                <span className="text-xl font-bold text-gray-800">SolarCharge</span>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => scrollToSection('hero')}
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200"
              >
                Home
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200"
              >
                Why Choose Us
              </button>
              <button
                onClick={() => scrollToSection('stations')}
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200"
              >
                Stations
              </button>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigateTo('login')}
                  className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200"
                >
                  Login
                </button>
                <button
                  onClick={() => navigateTo('signup')}
                  className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-2 px-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105"
                >
                  Sign Up
                </button>
              </div>
            </div>
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-gray-700 hover:text-blue-600 focus:outline-none focus:text-blue-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
          {isMenuOpen && (
            <div className="md:hidden">
              <div className="px-2 pt-2 pb-3 space-y-1 bg-white/95 backdrop-blur-md rounded-b-2xl shadow-xl border border-white/20">
                <button
                  onClick={() => scrollToSection('hero')}
                  className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                >
                  Home
                </button>
                <button
                  onClick={() => scrollToSection('features')}
                  className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                >
                  Why Choose Us
                </button>
                <button
                  onClick={() => scrollToSection('stations')}
                  className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                >
                  Stations
                </button>
                <button
                  onClick={() => navigateTo('login')}
                  className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                >
                  Login
                </button>
                <button
                  onClick={() => navigateTo('signup')}
                  className="block w-full text-left px-3 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-teal-700 transition-all duration-200"
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}
        </div>
      </nav> */}

      {/* Main Content with top padding for fixed nav */}
      <div className="w-full pt-16 sm:pt-20 pb-8">
        {/* Hero Section - Glassmorphism Design */}
        <header id="hero" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          {/* Glass card effect */}
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden text-center py-16 sm:py-20 px-6 sm:px-8 lg:px-12" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            {/* Shimmer effect overlay */}
            <div className="absolute inset-0 opacity-30" style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
              animation: 'shimmer 3s ease-in-out infinite'
            }}></div>
            
            <div className="relative z-10">
              {/* Badge */}
              <div className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold mb-8 animate-fade-in-down" style={{
                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(249, 210, 23, 0.2) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#000b3d'
              }}>
                <span className="mr-2 text-lg">⚡</span>
                Powered by Solar Energy
              </div>
              
              {/* Logo with animation */}
              <div className="flex items-center justify-center mb-8 animate-fade-in-down delay-100">
                <div className="relative">
                  <img 
                    src="/img/solarchargelogo.png" 
                    alt="SolarCharge Logo" 
                    className="h-24 md:h-28 w-auto drop-shadow-2xl animate-logo-float"
                  />
                  {/* Glow effect */}
                  <div className="absolute inset-0 blur-xl opacity-50 animate-pulse-slow" style={{
                    background: 'radial-gradient(circle, rgba(249, 210, 23, 0.4) 0%, transparent 70%)'
                  }}></div>
                </div>
              </div>
              
              {/* Main Heading with gradient */}
              <h1 className="text-7xl md:text-8xl font-black leading-tight mb-6 animate-fade-in-down delay-200" style={{
                background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: '0 0 40px rgba(56, 182, 255, 0.3)'
              }}>
                SolarCharge
              </h1>
              
              <h2 className="text-4xl md:text-5xl font-bold mb-8 animate-fade-in-down delay-300" style={{ color: '#000b3d' }}>
                Powering Your World, Sustainably
              </h2>
              
              <p className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto leading-relaxed animate-fade-in-up delay-400" style={{ color: '#000b3d', opacity: 0.8 }}>
                Never run out of power again. Access smart, solar-powered charging stations for your mobile devices, anywhere, anytime.
              </p>
              
              {/* CTA Buttons with glassmorphism */}
              <div className="flex flex-col sm:flex-row gap-6 justify-center animate-fade-in-up delay-500">
                <button
                  onClick={() => navigateTo('login')}
                  className="group relative px-10 py-4 rounded-2xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    focusRingColor: 'rgba(56, 182, 255, 0.5)'
                  }}
                >
                  <span className="relative z-10 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Login to Charge
                  </span>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                  }}></div>
                </button>
                
                <button
                  onClick={() => navigateTo('signup')}
                  className="group relative px-10 py-4 rounded-2xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                    boxShadow: '0 8px 24px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    focusRingColor: 'rgba(249, 210, 23, 0.5)'
                  }}
                >
                  <span className="relative z-10 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                    </svg>
                    Join SolarCharge
                  </span>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                    background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(249, 210, 23, 0.3) 100%)'
                  }}></div>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Features Section - Glass Cards */}
        <section id="features" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-300 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="text-center mb-12">
              <h2 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>Why Choose SolarCharge?</h2>
              <p className="text-lg sm:text-xl max-w-2xl mx-auto" style={{ color: '#000b3d', opacity: 0.7 }}>Experience the future of sustainable charging with our innovative solar-powered stations.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature Card 1 - Sun themed */}
            <div className="group relative backdrop-blur-xl rounded-3xl p-8 text-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(249, 210, 23, 0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(249, 210, 23, 0.3)'
              }}>
                <span className="text-4xl">☀️</span>
              </div>
              <h3 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Sustainable Power</h3>
              <p className="leading-relaxed" style={{ color: '#000b3d', opacity: 0.7 }}>Charge your devices with clean, renewable solar energy, reducing your carbon footprint and contributing to a greener planet.</p>
            </div>
            
            {/* Feature Card 2 - Lightning themed */}
            <div className="group relative backdrop-blur-xl rounded-3xl p-8 text-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" style={{
                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(56, 182, 255, 0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(56, 182, 255, 0.3)'
              }}>
                <span className="text-4xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Tiered Charging</h3>
              <p className="leading-relaxed" style={{ color: '#000b3d', opacity: 0.7 }}>Enjoy basic free charging or upgrade to premium for faster speeds, priority access, and real-time monitoring features.</p>
            </div>
            
            {/* Feature Card 3 - Solar panel themed */}
            <div className="group relative backdrop-blur-xl rounded-3xl p-8 text-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" style={{
                background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.3) 0%, rgba(0, 11, 61, 0.1) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(0, 11, 61, 0.3)'
              }}>
                <span className="text-4xl">📱</span>
              </div>
              <h3 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Smart Management</h3>
              <p className="leading-relaxed" style={{ color: '#000b3d', opacity: 0.7 }}>Intelligent system prevents idle usage, manages quotas efficiently, and provides real-time data and analytics.</p>
            </div>
            </div>
          </div>
        </section>

        {/* Available Stations Section - Glass Design */}
        <section id="stations" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-400 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="text-center mb-10">
              <h3 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>Find a Charging Station Near You</h3>
              <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>Locate and use our solar-powered charging stations across the city</p>
            
              {/* Location Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
              {!userLocation ? (
                <button
                  onClick={getUserLocation}
                  disabled={locationLoading}
                  className="font-bold py-3 px-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-white"
                  style={{
                    background: locationLoading ? 'linear-gradient(135deg, rgba(56, 182, 255, 0.6) 0%, rgba(0, 11, 61, 0.6) 100%)' : 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                >
                  {locationLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Getting Location...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                      </svg>
                      Find Stations Near Me
                    </>
                  )}
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="px-4 py-2 rounded-lg flex items-center gap-2 backdrop-blur-md" style={{
                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(56, 182, 255, 0.2) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: '#000b3d'
                  }}>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                    </svg>
                    Location Found!
                  </div>
                  <button
                    onClick={() => setShowAllStations(!showAllStations)}
                    className="font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:scale-105 text-white"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.8) 0%, rgba(0, 11, 61, 0.6) 100%)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: '0 4px 16px rgba(0, 11, 61, 0.3)'
                    }}
                  >
                    {showAllStations ? 'Show Nearby Only' : 'Show All Stations'}
                  </button>
                </div>
              )}
            </div>
            
              {/* Location Error */}
              {locationError && (
                <div className="mt-4 px-4 py-3 rounded-lg backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626'
                }}>
                  {locationError}
                </div>
              )}
            </div>
            
            {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{
                borderColor: '#38b6ff',
                borderTopColor: 'transparent'
              }}></div>
              <p className="text-lg ml-4" style={{ color: '#000b3d', opacity: 0.7 }}>Loading stations...</p>
            </div>
            ) : (userLocation && nearbyStations.length > 0 && !showAllStations) ? (
              // Show nearby stations
              <div>
                <div className="text-center mb-8">
                  <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>Nearby Charging Stations</h4>
                  <p style={{ color: '#000b3d', opacity: 0.7 }}>Showing the closest stations to your location</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {nearbyStations.map((station, index) => (
                  <a
                    key={station.station_id}
                    href={generateGoogleMapsUrl(station.location_description, station.latitude, station.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                      animationDelay: `${index * 100}ms`
                    }}
                  >
                    <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.8) 0%, rgba(249, 210, 23, 0.6) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      {station.distance < 1 ? `${Math.round(station.distance * 1000)}m` : `${station.distance.toFixed(1)}km`}
                    </div>
                    <div className="flex flex-col gap-2">
                      <h4 className="text-2xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                      <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        {station.location_description}
                      </p>
                      <p className="text-xs mt-2 font-medium" style={{ color: '#38b6ff' }}>
                        📍 Click to open precise location in Google Maps
                      </p>
                    </div>
                  </a>
                ))}
                </div>
              </div>
            ) : stations.length > 0 ? (
              // Show all stations
              <div>
                {userLocation && (
                  <div className="text-center mb-8">
                    <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>All Charging Stations</h4>
                    <p style={{ color: '#000b3d', opacity: 0.7 }}>Showing all available stations</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stations.map((station, index) => (
                  <a
                    key={station.station_id}
                    href={generateGoogleMapsUrl(station.location_description, station.latitude, station.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                      animationDelay: `${index * 100}ms`
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <h4 className="text-2xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                      <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        {station.location_description}
                      </p>
                      <p className="text-xs mt-2 font-medium" style={{ color: '#38b6ff' }}>
                        📍 Click to open precise location in Google Maps
                      </p>
                    </div>
                  </a>
                ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <span className="text-4xl">🔌</span>
                </div>
                <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>No Stations Available</h4>
                <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>No charging stations found at the moment. Please check back later!</p>
              </div>
            )}
          </div>
        </section>

        {/* Subscription CTA Section - Glass Design */}
        <section className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-500 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 text-center overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="flex items-center justify-center mb-6">
              <span className="text-4xl sm:text-5xl mr-3 animate-bounce-slow">⚡</span>
              <h3 className="text-3xl sm:text-4xl font-bold" style={{ color: '#000b3d' }}>Ready to Start Charging?</h3>
            </div>
            <p className="text-base sm:text-lg mb-8 max-w-2xl mx-auto" style={{ color: '#000b3d', opacity: 0.8 }}>
              Get a subscription to access charging controls, monitor your usage, and enjoy premium features at our solar-powered charging stations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigateTo('signup')}
                className="relative px-8 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                  boxShadow: '0 8px 24px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  focusRingColor: 'rgba(249, 210, 23, 0.5)'
                }}
              >
                Get Started
              </button>
              <button
                onClick={() => navigateTo('login')}
                className="relative px-8 py-3 rounded-xl font-bold overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 backdrop-blur-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                  border: '2px solid #38b6ff',
                  color: '#000b3d',
                  boxShadow: '0 4px 16px rgba(56, 182, 255, 0.2)',
                  focusRingColor: 'rgba(56, 182, 255, 0.5)'
                }}
              >
                Sign In
              </button>
            </div>
            <p className="text-sm mt-6" style={{ color: '#000b3d', opacity: 0.6 }}>
              📍 All station locations open in Google Maps with precise coordinates
            </p>
          </div>
        </section>

        {/* Footer - Glass Design */}
        <footer className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-600 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden text-center py-10 sm:py-12 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="flex items-center justify-center mb-4">
              <img 
                src="/img/solarchargelogo.png" 
                alt="SolarCharge Logo" 
                className="h-10 sm:h-12 w-auto mr-3 drop-shadow-lg"
              />
              <h3 className="text-2xl sm:text-3xl font-bold" style={{ color: '#000b3d' }}>SolarCharge</h3>
            </div>
            <p className="text-base sm:text-lg mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>© {new Date().getFullYear()} SolarCharge. All rights reserved.</p>
            <p className="text-sm sm:text-base" style={{ color: '#000b3d', opacity: 0.6 }}>Innovating for a sustainable future.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;