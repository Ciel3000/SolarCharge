// frontend/src/pages/LandingPage.js
// This component displays the landing content and available charging stations.

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // adjust path if needed

function HomePage({ session, stations, loading, handleSignOut, navigateTo }) {
  // Debugging log for HomePage
  console.log('HomePage rendered. Session:', session ? session.user.email : 'No session');
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergy: 0 });

  useEffect(() => {
    async function fetchSubscription() {
      if (!session) return;
      const { data, error } = await supabase
        .from('user_subscription')
        .select('*,subscription_plans(*)')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .single();
      if (!error && data) {
        setSubscription(data);
        // Fetch usage analytics for this user for the current month
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data: usageData, error: usageError } = await supabase
          .from('charging_session')
          .select('*')
          .eq('user_id', session.user.id)
          .gte('start_time', startOfMonth);
        if (!usageError && usageData) {
          const totalSessions = usageData.length;
          const totalDuration = usageData.reduce((sum, session) => {
            const endTime = session.end_time || new Date();
            const duration = new Date(endTime) - new Date(session.start_time);
            return sum + duration;
          }, 0);
          const totalCost = usageData.reduce((sum, session) => sum + (session.total_cost || 0), 0);
          const totalEnergy = usageData.reduce((sum, session) => sum + (session.energy_consumed_mwh || 0), 0);
          setUsage({
            totalSessions,
            totalDuration: Math.round(totalDuration / (1000 * 60)), // minutes
            totalCost: totalCost.toFixed(2),
            totalEnergy: totalEnergy.toFixed(2)
          });
        } else {
          setUsage({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergy: 0 });
        }
      } else {
        setSubscription(null);
        setUsage({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergy: 0 });
        // Fetch available plans if no subscription
        const { data: plansData } = await supabase
          .from('subscription_plans')
          .select('*');
        setPlans(plansData || []);
      }
    }
    fetchSubscription();
  }, [session]);

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
              {!session ? (
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
              ) : (
                <div className="flex items-center space-x-4">
                  <span className="text-gray-600 text-sm">Welcome, {session.user.email.split('@')[0]}</span>
                  <button
                    onClick={handleSignOut}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 disabled:opacity-50"
                    disabled={loading}
                  >
                    {loading ? 'Signing Out...' : 'Sign Out'}
                  </button>
                </div>
              )}
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
                {!session ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="px-3 py-2 text-gray-600 text-sm">
                      Welcome, {session.user.email.split('@')[0]}
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-3 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-all duration-200 disabled:opacity-50"
                      disabled={loading}
                    >
                      {loading ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content with top padding for fixed nav */}
      <div className="w-full pt-20">
        {/* Hero + Features Section */}
        <section id="hero-features" className="w-full max-w-5xl mx-auto py-12 px-4 md:px-8 bg-gradient-to-br from-green-100 via-blue-100 to-cyan-100 rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20 overflow-hidden">
          <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-6 max-w-xl mx-auto">
            <div className="flex items-center space-x-3">
              <span className="text-4xl">⚡</span>
              <span className="text-3xl font-extrabold text-gray-800 tracking-tight">SolarCharge</span>
            </div>
            {session && (
              <div className="text-lg text-gray-700">
                Hello <span className="font-semibold">{session.user.email.split('@')[0]}</span>!
              </div>
            )}
            {subscription ? (
              <div className="bg-white rounded-xl shadow-lg p-8 border-2 border-green-300 w-full max-w-md animate-fade-in-up flex flex-col items-center">
                <h4 className="text-xl font-bold text-green-700 mb-2 flex items-center gap-2">
                  <span className="text-green-500">🌟</span> Your Current Plan
                </h4>
                <div className="mb-2 text-lg font-semibold text-gray-800">{subscription.subscription_plans.plan_name}</div>
                <div className="mb-2 text-gray-600">{subscription.subscription_plans.description}</div>
                <div className="mb-2 text-gray-600"><strong>Price:</strong> ${subscription.subscription_plans.price}</div>
                <div className="mb-6 text-gray-600"><strong>Daily Limit:</strong> {subscription.subscription_plans.daily_mwh_limit} mWh</div>
                {/* Usage Analytics */}
                <div className="flex flex-row justify-center gap-6 w-full mb-6">
                  <div className="flex flex-col items-center bg-blue-50 rounded-lg px-4 py-2 shadow">
                    <span className="text-blue-600 text-2xl font-bold">{usage.totalSessions}</span>
                    <span className="text-xs text-gray-500 mt-1">Sessions</span>
                  </div>
                  <div className="flex flex-col items-center bg-green-50 rounded-lg px-4 py-2 shadow">
                    <span className="text-green-600 text-2xl font-bold">{usage.totalDuration}</span>
                    <span className="text-xs text-gray-500 mt-1">Minutes</span>
                  </div>
                  <div className="flex flex-col items-center bg-purple-50 rounded-lg px-4 py-2 shadow">
                    <span className="text-purple-600 text-2xl font-bold">${usage.totalCost}</span>
                    <span className="text-xs text-gray-500 mt-1">Total Cost</span>
                  </div>
                </div>
                {/* Energy Consumed and Progress Bar */}
                <div className="w-full mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600 font-medium">Energy Consumed (This Month)</span>
                    <span className="text-sm text-gray-700 font-bold">{usage.totalEnergy} mWh</span>
                  </div>
                  {/* Progress Bar Calculation */}
                  {(() => {
                    const daysSoFar = new Date().getDate();
                    const plan = subscription.subscription_plans;
                    const monthlyLimit = plan.daily_mwh_limit * daysSoFar;
                    const percent = monthlyLimit > 0 ? Math.min(100, ((usage.totalEnergy / monthlyLimit) * 100).toFixed(0)) : 0;
                    return (
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className={`h-4 rounded-full transition-all duration-500 ${percent < 80 ? 'bg-green-400' : percent < 100 ? 'bg-yellow-400' : 'bg-red-500'}`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    );
                  })()}
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-gray-500">{(() => {
                      const daysSoFar = new Date().getDate();
                      const plan = subscription.subscription_plans;
                      const monthlyLimit = plan.daily_mwh_limit * daysSoFar;
                      const percent = monthlyLimit > 0 ? Math.min(100, ((usage.totalEnergy / monthlyLimit) * 100).toFixed(0)) : 0;
                      return `${percent}% of monthly limit (${monthlyLimit} mWh)`;
                    })()}</span>
                  </div>
                </div>
                <button
                  className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-xl transition-colors w-full"
                  onClick={() => navigateTo('subscription')}
                >
                  Manage Subscription
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full animate-fade-in-up">
                <h3 className="text-2xl font-bold text-blue-700 mb-4">Choose Your Plan</h3>
                <div className="grid grid-cols-1 gap-6 w-full">
                  {plans.map(plan => (
                    <div key={plan.plan_id} className="bg-white rounded-xl shadow-lg p-6 border-2 border-blue-200 w-full">
                      <div className="text-xl font-bold text-blue-700 mb-2">{plan.plan_name}</div>
                      <div className="text-gray-600 mb-2">{plan.description}</div>
                      <div className="text-gray-600 mb-2"><strong>Price:</strong> ${plan.price}</div>
                      <div className="text-gray-600 mb-4"><strong>Daily Limit:</strong> {plan.daily_mwh_limit} mWh</div>
                      <button
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-xl transition-colors w-full"
                        onClick={() => navigateTo('subscription')}
                      >
                        Subscribe
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Available Stations Section */}
        <section id="stations" className="w-full max-w-5xl mx-auto bg-white/90 backdrop-blur-sm p-10 rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20">
          <div className="text-center mb-10">
            <h3 className="text-4xl font-bold text-gray-800 mb-4">Find a Charging Station Near You</h3>
            <p className="text-xl text-gray-600">Locate and use our solar-powered charging stations across the city</p>
          </div>
          {!subscription ? (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">🔒</span>
              </div>
              <h4 className="text-2xl font-bold text-gray-800 mb-2">Subscription Required</h4>
              <p className="text-gray-600 text-lg">Subscribe to a plan to view station details.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {stations.map((station, index) => (
                <div
                  key={station.station_id}
                  className="group bg-gradient-to-br from-blue-50 to-cyan-50 p-8 rounded-2xl shadow-lg border border-blue-200 text-left transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => navigateTo('station', { station })}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-2xl font-bold text-blue-800">{station.station_name}</h4>
                    <div className={`w-3 h-3 rounded-full ${station.current_battery_level > 50 ? 'bg-green-500' : station.current_battery_level > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                  </div>
                  
                  <p className="text-gray-700 text-base mb-6 flex items-center">
                    <svg className="w-5 h-5 mr-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                    </svg>
                    {station.location_description}
                  </p>
                  
                  <div className="space-y-3 text-gray-600">
                    <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                      <span className="flex items-center">
                        <span className="mr-2">🔌</span> Free Ports
                      </span>
                      <span className="font-bold text-blue-600">{station.available_free_ports} / {station.num_free_ports}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                      <span className="flex items-center">
                        <span className="mr-2">⚡</span> Premium Ports
                      </span>
                      <span className="font-bold text-purple-600">{station.available_premium_ports} / {station.num_premium_ports}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                      <span className="flex items-center">
                        <span className="mr-2">🔋</span> Battery Level
                      </span>
                      <span className={`font-bold ${station.current_battery_level > 50 ? 'text-green-600' : station.current_battery_level > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {station.current_battery_level}%
                      </span>
                    </div>
                  </div>
                  
                  {station.last_maintenance_message && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-gray-600 text-sm flex items-center">
                        <span className="mr-2">🛠️</span> Last Maintenance: {station.last_maintenance_message}
                      </p>
                    </div>
                  )}
                </div>
              ))}
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

export default HomePage;