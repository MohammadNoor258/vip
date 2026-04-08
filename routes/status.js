const express = require('express');
const { getSubscriptionState } = require('../services/subscriptionService');
const { resolveRestaurantIdAsync } = require('../middleware/requireSubscription');

const router = express.Router();

router.get('/', async (req, res) => {
  const restaurantId = await resolveRestaurantIdAsync(req);
  const s = await getSubscriptionState(false, restaurantId);
  res.json({
    subscriptionActive: s.active,
    message: s.active ? '' : s.message || 'Subscription expired.',
    restaurantId,
  });
});

module.exports = router;
