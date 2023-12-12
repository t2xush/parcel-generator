const express = require('express');
const app = express();
const PORT = process.env.PORT || 8000;
const faker = require('faker');
const mysql = require('mysql2/promise');
const fs = require('fs'); // Add the fs module

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "team12user",
    password: process.env.DB_PASSWORD || "awateam12",
    database: process.env.DB_NAME || "consumerdb",
};

if (process.env.WEBSITE_RESOURCE_GROUP !== undefined) {
    // We are running in Azure App Service
    // Use Azure Database for MySQL
    dbConfig.ssl = {
        ca: fs.readFileSync("./azure-db-ssl-cert/DigiCertGlobalRootCA.crt.pem"),
    };
}

// Function to generate parcels for existing users
async function generateParcels() {
    let connection;

    try {
        // Create a new connection for each execution
        connection = await mysql.createPool(dbConfig);

        // Generate random parcels for 0-2 users
        const numParcels = faker.datatype.number({ min: 0, max: 2 });

        for (let i = 0; i < numParcels; i++) {
            const senderName = faker.name.findName();
            const senderAddress = faker.address.streetAddress();
            const senderPhone = faker.phone.phoneNumberFormat().replace(/-/g, '');

            // Fetch a random user as the recipient
            const [recipient] = await connection.execute('SELECT name FROM user ORDER BY RAND() LIMIT 1');
            const recipientName = recipient[0].name;

            const recipientAddress = faker.address.streetAddress();
            const recipientPhone = faker.phone.phoneNumberFormat().replace(/-/g, '');

            const parcelSize = {
                width: faker.datatype.number({ min: 1, max: 50 }),
                height: faker.datatype.number({ min: 1, max: 50 }),
                length: faker.datatype.number({ min: 1, max: 50 }),
                weight: faker.datatype.float({ min: 0.1, max: 10.0 })
            };

            // Fetch a random location
            const [location] = await connection.execute('SELECT locationname FROM locations ORDER BY RAND() LIMIT 1');

            const reservationCode = faker.datatype.number({ min: 1000, max: 9999 });

            // Update cabinets with the generated code, location, and status changes
            await connection.execute(
                'UPDATE cabinets SET code = ?, cabinetStatus = "Occupied", IsAvailable = false WHERE cabinetStatus = "Available" AND IsAvailable = true AND Locationname = ? ORDER BY RAND() LIMIT 1',
                [reservationCode, location[0].locationname]
            );

            // Insert the parcel into the database
            const [result] = await connection.execute(
                'INSERT INTO parcel ( sendername, senderaddress, senderPhoneNumber, ' +
                'recipientname, recipientaddress, recipientPhoneNumber, ' +
                'width, height, length, weight, location, IsCodeValid,reservationCode, status) ' +
                'VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)',
                [
                    senderName,
                    senderAddress,
                    senderPhone,
                    recipientName,
                    recipientAddress,
                    recipientPhone,
                    parcelSize.width,
                    parcelSize.height,
                    parcelSize.length,
                    parcelSize.weight,
                    location[0].locationname,
                    false,
                    reservationCode,
                    'Parcel In Locker'
                ]
            );

            console.log(`Parcel with ID ${result.insertId} generated successfully.`);
        }

        console.log('Succeed'); // Log succeed after generating parcels
    } catch (error) {
        console.error('Error generating parcels:', error);
    } finally {
        // Close the connection after use
        if (connection) {
            connection.end();
        }
    }
}

// Call generateParcels after a delay and then at intervals (every 30 seconds)
setTimeout(async () => {
    await generateParcels();

    // Call generateParcels at intervals (every 30 seconds)
    setInterval(async () => {
        await generateParcels();
    }, 2*60 * 1000); // Execute every 30 seconds
},  2*60 * 1000); // Initial delay of 30 seconds

// API endpoint to trigger parcel generation
app.get('/generate-parcels', async (req, res) => {
    try {
        await generateParcels();
        res.status(200).json({ message: 'Parcels generated successfully' });
    } catch (error) {
        console.error('Error generating parcels:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a connection and handle success or error
mysql.createConnection(dbConfig)
  .then(async (connection) => {
    console.log('Database connected');})

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
