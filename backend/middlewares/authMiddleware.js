const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

exports.authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  let token;

  if (authHeader) {
    token = authHeader.split(" ")[1];
  } else if (queryToken) {
    token = queryToken;
  } else {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};