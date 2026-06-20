require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Fix DNS Resolution Issue
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
 
const departmentPostRoutes =
  require('./routes/departmentPost');

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
  });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/members', require('./routes/member'));
app.use('/api/departments', require('./routes/department'));
app.use('/api/projects', require('./routes/project'));
app.use('/api/messages', require('./routes/message'));
app.use('/api/giving', require('./routes/giving'));
app.use(
  '/department-posts',
  departmentPostRoutes
);
app.get('/', (req, res) => {
  res.json({ message: 'Church App Backend is Running 🚀' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});