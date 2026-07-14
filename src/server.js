require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Kết nối cơ sở dữ liệu MongoDB Cloud cho Web Service
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Web-Service connected to MongoDB successfully.'))
  .catch(err => {
    console.error('MongoDB connection error in Web-Service:', err);
    process.exit(1);
  });

app.use(express.json());

// Chỉ định phục vụ thư mục tĩnh Frontend
app.use(express.static(path.join(__dirname, '../public')));

// Gắn bộ định tuyến API chính thức
app.use('/api', apiRoutes);

// Endpoint phục vụ tự động kiểm tra trạng thái
app.get('/health', (req, res) => {
  res.status(200).send('Web-Service is healthy!');
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Web-Service is running on port ${PORT}`);
});
