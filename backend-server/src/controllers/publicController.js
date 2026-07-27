// src/controllers/publicController.js
// Public station data (replaces public_station_view)

const pool = require('../config/database');

// Get all public stations
async function getPublicStations(req, res, next) {
  try {
    const [rows] = await pool.query(`
      SELECT
        s.station_id,
        s.station_name,
        s.location_description,
        s.latitude,
        s.longitude,
        s.is_active,
        s.current_battery_level,
        s.price_per_mah,
        s.num_free_ports,
        s.num_premium_ports,
        s.device_mqtt_id,
        COUNT(p.port_id) as total_ports,
        SUM(CASE WHEN p.current_status = 'available' THEN 1 ELSE 0 END) as available_ports,
        SUM(CASE WHEN p.current_status = 'available' AND p.is_premium = true THEN 1 ELSE 0 END) as available_premium_ports
      FROM charging_station s
      LEFT JOIN charging_port p ON s.station_id = p.station_id
      WHERE s.is_active = true
      GROUP BY s.station_id, s.device_mqtt_id
      ORDER BY s.station_name
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Get single public station
async function getPublicStation(req, res, next) {
  try {
    const { stationId } = req.params;
    const [rows] = await pool.query(`
      SELECT
        s.*,
        COUNT(p.port_id) as total_ports,
        SUM(CASE WHEN p.current_status = 'available' THEN 1 ELSE 0 END) as available_ports,
        SUM(CASE WHEN p.current_status = 'available' AND p.is_premium = true THEN 1 ELSE 0 END) as available_premium_ports
      FROM charging_station s
      LEFT JOIN charging_port p ON s.station_id = p.station_id
      WHERE s.station_id = ? AND s.is_active = true
      GROUP BY s.station_id
    `, [stationId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { getPublicStations, getPublicStation };
