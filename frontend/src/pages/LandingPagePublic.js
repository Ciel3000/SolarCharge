import React, { useState } from 'react';

function LandingPage({ stations, loading, navigateTo }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-cyan-100 flex flex-col items-center justify-center p-4 text-gray-800 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-green-400/20 to-blue-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-cyan-400/20 to-emerald-400/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-blue-400/10 to-green-400/10 rounded-full blur-3xl"></div>
      </div>

      {/* Navigation Menu */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">⚡</span>
                <span className="text-xl font-bold text-gray-800">SolarCharge</span>
              </div>
            </div>

            {/* Desktop Navigation */}
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

            {/* Mobile menu button */}
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

          {/* Mobile Navigation */}
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
      </nav>

      {/* Main Content with top padding for fixed nav */}
      <div className="w-full pt-20">
        {/* Hero Section */}
        <header id="hero" className="w-full max-w-5xl mx-auto text-center py-16 px-8 bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20">
          <div className="absolute inset-0 bg-gradient-to-r from-green-400/5 to-blue-400/5 rounded-3xl"></div>
          <div className="relative z-10">
            <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-100 to-blue-100 rounded-full text-sm font-medium text-green-800 mb-6 animate-fade-in-down">
              <span className="mr-2">⚡</span>
              Powered by Solar Energy
            </div>
            <h1 className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-blue-600 to-cyan-600 leading-tight mb-6 animate-fade-in-down">
              SolarCharge
            </h1>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6 animate-fade-in-down delay-100">
              Powering Your World, Sustainably
            </h2>
            <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed animate-fade-in-up delay-200">
              Never run out of power again. Access smart, solar-powered charging stations for your mobile devices, anywhere, anytime.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center animate-fade-in-up delay-300">
              <button
                onClick={() => navigateTo('login')}
                className="group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-10 rounded-2xl shadow-xl transform transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Login to Charge
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-indigo-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
              <button
                onClick={() => navigateTo('signup')}
                className="group bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-4 px-10 rounded-2xl shadow-xl transform transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300 relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                  </svg>
                  Join SolarCharge
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-teal-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>
        </header>

        {/* Features Section */}
        <section id="features" className="w-full max-w-5xl mx-auto bg-white/90 backdrop-blur-sm p-10 rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-800 mb-4">Why Choose SolarCharge?</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Experience the future of sustainable charging with our innovative solar-powered stations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group flex flex-col items-center text-center p-8 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg border border-green-200 transform transition-all duration-300 hover:scale-105 hover:shadow-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">☀️</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Sustainable Power</h3>
              <p className="text-gray-600 leading-relaxed">Charge your devices with clean, renewable solar energy, reducing your carbon footprint and contributing to a greener planet.</p>
            </div>
            <div className="group flex flex-col items-center text-center p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 shadow-lg border border-blue-200 transform transition-all duration-300 hover:scale-105 hover:shadow-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Tiered Charging</h3>
              <p className="text-gray-600 leading-relaxed">Enjoy basic free charging or upgrade to premium for faster speeds, priority access, and real-time monitoring features.</p>
            </div>
            <div className="group flex flex-col items-center text-center p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg border border-purple-200 transform transition-all duration-300 hover:scale-105 hover:shadow-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">📱</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Smart Management</h3>
              <p className="text-gray-600 leading-relaxed">Intelligent system prevents idle usage, manages quotas efficiently, and provides real-time data and analytics.</p>
            </div>
          </div>
        </section>

        {/* Available Stations Section */}
        <section id="stations" className="w-full max-w-5xl mx-auto bg-white/90 backdrop-blur-sm p-10 rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20">
          <div className="text-center mb-10">
            <h3 className="text-4xl font-bold text-gray-800 mb-4">Find a Charging Station Near You</h3>
            <p className="text-xl text-gray-600">Locate and use our solar-powered charging stations across the city</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 text-lg ml-4">Loading stations...</p>
            </div>
          ) : stations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {stations.map((station, index) => (
                <a
                  key={station.station_id}
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(station.location_description)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-gradient-to-br from-blue-50 to-cyan-50 p-8 rounded-2xl shadow-lg border border-blue-200 text-left transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex flex-col gap-2">
                    <h4 className="text-2xl font-bold text-blue-800">{station.station_name}</h4>
                    <p className="text-gray-700 text-base flex items-center">
                      <svg className="w-5 h-5 mr-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                      </svg>
                      {station.location_description}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">🔌</span>
              </div>
              <h4 className="text-2xl font-bold text-gray-800 mb-2">No Stations Available</h4>
              <p className="text-gray-600 text-lg">No charging stations found at the moment. Please check back later!</p>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="w-full max-w-5xl mx-auto text-center py-12 text-gray-600 relative z-10">
          <div className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white/20">
            <div className="flex items-center justify-center mb-4">
              <span className="text-2xl mr-2">⚡</span>
              <h3 className="text-2xl font-bold text-gray-800">SolarCharge</h3>
            </div>
            <p className="text-lg text-gray-700 mb-2">&copy; {new Date().getFullYear()} SolarCharge. All rights reserved.</p>
            <p className="text-gray-600">Innovating for a sustainable future.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;