const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

// ONE-TIME MIGRATION ROUTE — DELETE THIS FILE AFTER USE
const SECRET = 'run-migration-now-2026';

router.get('/' + SECRET, (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../../db/hrms.db'));
    db.pragma('foreign_keys = OFF');

    db.exec(`
      DELETE FROM loan_emi_payments;
      DELETE FROM loans;
      DELETE FROM salary_slips;
      DELETE FROM advances;
      DELETE FROM sessions;
      DELETE FROM audit_log;
      DELETE FROM punches;
      DELETE FROM wage_history;
      DELETE FROM users;
      DELETE FROM sqlite_sequence WHERE name IN ('users','loans','wage_history','punches','advances','salary_slips','audit_log','sessions','loan_emi_payments');
    `);

    const insertUser = db.prepare(`INSERT INTO users (id,employee_code,full_name,password_hash,role,phone,joined_on,is_active,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const users = [
      [1,'OWNER','Sharadbhai','$2a$10$dPqMb9B.6.HJEh0fKPcOp.7B8fG9oXhN2iK3Lm4Nq5OpQrS6TuBZW','OWNER',null,'2023-01-01',1,'2026-04-25 15:00:36'],
      [2,'EMP001','Yogeshji Rameshji Thakor','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE','9909571903','2023-06-01',1,'2026-04-25 15:00:36'],
      [3,'EMP002','Sanjayji Rameshji Thakor','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE','6353163394','2023-06-01',1,'2026-04-25 15:00:36'],
      [4,'EMP003','Karan Nenaji Thakor','$2a$10$kK1lL2mM3nN4oO5pP6qQ7rR8sS9tT0uU1vV2wW3xX4yY5zZ6aA7b','EMPLOYEE','6351097600','2023-06-01',1,'2026-04-25 15:00:36'],
      [5,'EMP004','Sanjay Amarbhai Thakor','$2a$10$vTWzq1X0N9K3L8M5p4O2Q1R7S8T9u0V1W2x3Y4z5A6B7C8D9E0fG1','ADMIN','8469084022','2023-06-01',1,'2026-04-25 15:00:36'],
      [6,'EMP005','Rohit Mukeshji Thakor','$2a$10$rR1sS2tT3uU4vV5wW6xX7yY8zZ9aA0bB1cC2dD3eE4fF5gG6hH7i','EMPLOYEE','6354108924','2023-06-01',1,'2026-04-25 15:00:36'],
      [7,'EMP006','Sumandevi Harilal Soni','$2a$10$cC1dD2eE3fF4gG5hH6iI7jJ8kK9lL0mM1nN2oO3pP4qQ5rR6sS7t','EMPLOYEE','9173780534','2023-06-01',1,'2026-04-25 15:00:36'],
      [8,'EMP007','Mukeshbhai Jeshangbhai Patel','$2a$10$mM1nN2oO3pP4qQ5rR6sS7tT8uU9vV0wW1xX2yY3zZ4aA5bB6cC7d','EMPLOYEE','9081044109','2023-06-01',1,'2026-04-25 15:00:36'],
      [9,'EMP008','Danbahadur Babasingh Chauhan','$2a$10$dD1eE2fF3gG4hH5iI6jJ7kK8lL9mM0nN1oO2pP3qQ4rR5sS6tT7u','EMPLOYEE','9723189363','2023-06-01',1,'2026-04-25 15:00:36'],
      [10,'EMP009','Harshad Chandrkantbhai Suthar','$2a$10$hH1iI2jJ3kK4lL5mM6nN7oO8pP9qQ0rR1sS2tT3uU4vV5wW6xX7y','EMPLOYEE','7698989599','2023-06-01',1,'2026-04-25 15:00:36'],
      [11,'EMP010','Mehul Parbatji Thakor','$2a$10$mM1nN2oO3pP4qQ5rR6sS7tT8uU9vV0wW1xX2yY3zZ4aA5bB6cC7d','EMPLOYEE','9724461491','2023-06-01',1,'2026-04-25 15:00:36'],
      [12,'EMP011','Bharti','$2a$10$bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7s','EMPLOYEE',null,'2023-06-01',1,'2026-04-25 15:00:36'],
      [13,'EMP012','Rajesh Vinodbhai Rohekar','$2a$10$rR1sS2tT3uU4vV5wW6xX7yY8zZ9aA0bB1cC2dD3eE4fF5gG6hH7i','EMPLOYEE','9510428227','2023-06-01',1,'2026-04-25 15:00:36'],
      [14,'EMP013','Soni Anilkumar','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE',null,'2023-06-01',1,'2026-04-25 15:00:36'],
      [15,'EMP014','Suraj Harilal Mahto','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE','6354802400','2023-06-01',1,'2026-04-25 15:00:36'],
      [16,'EMP015','Govind Shaileshji Thakor','$2a$10$gG1hH2iI3jJ4kK5lL6mM7nN8oO9pP0qQ1rR2sS3tT4uU5vV6wW7x','EMPLOYEE','9978169297','2023-06-01',1,'2026-04-25 15:00:36'],
      [17,'EMP016','Vinodbhai Ramchandra Rohekar','$2a$10$vV1wW2xX3yY4zZ5aA6bB7cC8dD9eE0fF1gG2hH3iI4jJ5kK6lL7m','EMPLOYEE','8460271388','2023-06-01',1,'2026-04-25 15:00:36'],
      [18,'EMP017','Prince Prajapati','$2a$10$pP1qQ2rR3sS4tT5uU6vV7wW8xX9yY0zZ1aA2bB3cC4dD5eE6fF7g','EMPLOYEE',null,'2023-06-01',1,'2026-04-25 15:00:36'],
      [19,'EMP018','Amitkumar Ramkaran Puresujan','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE','8423153235','2023-06-01',1,'2026-04-25 15:00:36'],
      [20,'EMP019','Daksha Nareshkumar Makwana','$2a$10$dD1eE2fF3gG4hH5iI6jJ7kK8lL9mM0nN1oO2pP3qQ4rR5sS6tT7u','EMPLOYEE','7600361266','2023-06-01',1,'2026-04-25 15:00:36'],
      [21,'EMP020','Kishan Parmaji Od','$2a$10$kK1lL2mM3nN4oO5pP6qQ7rR8sS9tT0uU1vV2wW3xX4yY5zZ6aA7b','EMPLOYEE','9998713833','2023-06-01',1,'2026-04-25 15:00:36'],
      [22,'EMP021','Rekhaben Tarachand Od','$2a$10$rR1sS2tT3uU4vV5wW6xX7yY8zZ9aA0bB1cC2dD3eE4fF5gG6hH7i','EMPLOYEE','8401205644','2023-06-01',1,'2026-04-25 15:00:36'],
      [23,'EMP022','Sachin','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE','7048521104','2023-06-01',1,'2026-04-25 15:00:36'],
      [24,'EMP023','Sushmita Shibaprasad Das','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE','7872457218','2023-06-01',1,'2026-04-25 15:00:36'],
      [25,'EMP024','Sandip Ramshane Puresujan','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE',null,'2023-06-01',1,'2026-04-25 15:00:36'],
      [26,'EMP025','Kedarnath Lakhtarbhai Vishwakarma','$2a$10$kK1lL2mM3nN4oO5pP6qQ7rR8sS9tT0uU1vV2wW3xX4yY5zZ6aA7b','EMPLOYEE','9601144334','2023-06-01',1,'2026-04-25 15:00:36'],
      [27,'EMP026','Nilesh Kailashbhai Eshi','$2a$10$nN1oO2pP3qQ4rR5sS6tT7uU8vV9wW0xX1yY2zZ3aA4bB5cC6dD7e','EMPLOYEE','8530642079','2023-06-01',1,'2026-04-25 15:00:36'],
      [28,'EMP027','Arjun Nenaji Thakor','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE','8780853953','2023-06-01',1,'2026-04-25 15:00:36'],
      [29,'EMP028','Naresh Lilabhai Thakor','$2a$10$nN1oO2pP3qQ4rR5sS6tT7uU8vV9wW0xX1yY2zZ3aA4bB5cC6dD7e','EMPLOYEE','9925147435','2023-06-01',1,'2026-04-25 15:00:36'],
      [30,'EMP029','Ashokji Bharatji Thakor','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE','9574220037','2023-06-01',1,'2026-04-25 15:00:36'],
      [31,'EMP030','Ashish','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE',null,'2023-06-01',1,'2026-04-25 15:00:36'],
      [32,'EMP031','Anjali Rakeshkumar Paswan','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE',null,'2023-06-01',1,'2026-04-25 15:00:36'],
      [33,'EMP032','SANJAY KUMAR','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE',null,'2026-01-01',1,'2026-04-25 15:00:36'],
      [34,'EMP033','AJAY KUMAR','$2a$10$aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4oO5pP6qQ7r','EMPLOYEE',null,'2026-01-01',1,'2026-04-25 15:00:36'],
      [35,'EMP034','Gopal Panchal','$2a$10$gG1hH2iI3jJ4kK5lL6mM7nN8oO9pP0qQ1rR2sS3tT4uU5vV6wW7x','EMPLOYEE',null,'2026-04-01',1,'2026-04-25 15:00:36'],
      [36,'EMP035','Sandip Rajput','$2a$10$sS1tT2uU3vV4wW5xX6yY7zZ8aA9bB0cC1dD2eE3fF4gG5hH6iI7j','EMPLOYEE',null,'2026-04-01',1,'2026-04-25 15:00:36'],
      [37,'EMP036','Ruby .','$2a$10$rR1sS2tT3uU4vV5wW6xX7yY8zZ9aA0bB1cC2dD3eE4fF5gG6hH7i','EMPLOYEE',null,'2026-04-01',1,'2026-04-25 15:00:36'],
    ];
    db.transaction(() => { for (const u of users) insertUser.run(...u); })();

    const insertLoan = db.prepare(`INSERT INTO loans (id,user_id,original_paise,issued_on,note,is_closed,issued_by,created_at) VALUES (?,?,?,?,?,?,?,?)`);
    const loans = [
      [36,3,4300000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [37,4,4450000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [38,5,19200000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [39,6,4100000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [40,7,1900000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [41,8,2000000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [42,9,2025100,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [43,10,47150000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [44,11,5800000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [45,12,292000,'2026-03-01',null,1,1,'2026-04-25 15:00:53'],
      [46,13,5000000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [47,14,2140700,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [48,16,3300000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [49,17,75200000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [50,20,11700000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [51,21,498800,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [52,25,1000000,'2026-03-01',null,1,1,'2026-04-25 15:00:53'],
      [53,26,3800000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [54,27,12300000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
      [55,28,2100000,'2026-03-01',null,0,1,'2026-04-25 15:00:53'],
    ];
    db.transaction(() => { for (const l of loans) insertLoan.run(...l); })();

    db.prepare(`UPDATE system_config SET geofence_lat=23.2363, geofence_lng=72.5062, geofence_radius_meters=200, lunch_start_minute=780, lunch_end_minute=840, ot_start_minute=1050, working_minutes_per_day=480 WHERE id=1`).run();

    db.pragma('foreign_keys = ON');
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const loanCount = db.prepare('SELECT COUNT(*) as c FROM loans').get().c;
    db.close();

    res.json({ success: true, users: userCount, loans: loanCount, message: 'Migration complete. DELETE this route file now.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
