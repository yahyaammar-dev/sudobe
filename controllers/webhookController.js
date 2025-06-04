exports.sendNotifications = async (req, res) => {
  try {

    console.log("Webhook is called")

    return res.status(201).json({
      success: true,
      message: 'Webhook called successfully',
    });

  } catch (err) {
    console.error('User creation error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};