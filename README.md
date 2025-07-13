# Solar Charge Project

A comprehensive solar-powered electric vehicle charging system with real-time monitoring and control capabilities.

## Project Overview

The Solar Charge Project integrates solar power generation with EV charging infrastructure, providing a sustainable and efficient charging solution. The system consists of three main components:

- **Frontend**: React-based web application for user interface
- **Backend**: Node.js/Express API server for data processing
- **Firmware**: ESP32 microcontroller code for hardware control

## Features

- Real-time solar panel and battery monitoring
- EV charging session management
- User authentication and payment processing
- Mobile-responsive web interface
- RESTful API for third-party integrations
- Data analytics and reporting
- Environmental impact tracking

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v5 or higher)
- PlatformIO (for firmware development)
- ESP32 development board

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd solar-charge-project
   ```

2. **Setup Frontend**
   ```bash
   cd frontend
   npm install
   npm start
   ```

3. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

4. **Setup Firmware**
   ```bash
   cd firmware/esp32-solar-charge
   # Update WiFi credentials in src/config.h
   pio run --target upload
   ```

## Project Structure

```
solar-charge-project/
├── frontend/          # React web application
├── backend/           # Node.js API server
├── firmware/          # ESP32 microcontroller code
├── docs/             # Project documentation
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## Documentation

- [Architecture Overview](docs/architecture.md)
- [API Specification](docs/api-spec.md)
- [Database Schema](docs/database-schema.md)
- [User Flows](docs/user-flows.md)
- [Business Plan](docs/business-plan.md)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the documentation in the `docs/` folder

## Roadmap

- [ ] Mobile app development
- [ ] Advanced analytics dashboard
- [ ] Multi-station management
- [ ] Payment gateway integration
- [ ] IoT device management
- [ ] Machine learning optimization 