const Event = require('../models/Event');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logActivity = require('../utils/activityLogger');

// Get all events
exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find()
      .populate('organizer', 'name profileImage')
      .sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('organizer', 'name profileImage');
    if (event) {
      res.json(event);
    } else {
      res.status(404).json({ message: 'Event not found' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create event (Admin only)
exports.createEvent = async (req, res) => {
  try {
    const { 
      title, description, date, time, location, category, price, userId,
      locationType, maxSpots, isFree, isFeatured, instructor 
    } = req.body;
    
    let image = '';
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
    }

    const newEvent = new Event({
      title,
      description,
      date,
      time,
      location,
      category,
      price: isFree === 'true' || isFree === true ? 0 : Number(price),
      image,
      organizer: userId,
      locationType: locationType || 'Online',
      maxSpots: Number(maxSpots) || 50,
      isFree: isFree === 'true' || isFree === true,
      isFeatured: isFeatured === 'true' || isFeatured === true,
      instructor: instructor || 'Belnique'
    });

    const savedEvent = await newEvent.save();

    // Create notifications for all students, professors, and collectors
    try {
        const users = await User.find({ role: { $in: ['student', 'professor', 'collector'] } }).select('_id');
        if (users.length > 0) {
            const notifications = users.map(user => ({
                user: user._id,
                title: 'Novo Evento',
                message: `Novo evento: "${savedEvent.title}"`,
                type: 'info',
                relatedId: savedEvent._id,
                link: '/eventos'
            }));
            await Notification.insertMany(notifications);
        }
    } catch (error) {
        console.error('Error creating event notifications:', error);
    }

    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    await logActivity({
      user: isRealAdmin ? undefined : userId,
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'EVENT_CREATE',
      details: `New event created: ${savedEvent.title}`,
      targetId: savedEvent._id
    });

    res.status(201).json(savedEvent);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Get my events
exports.getMyEvents = async (req, res) => {
  try {
    const events = await Event.find({ attendees: req.user._id })
      .populate('organizer', 'name profileImage')
      .sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update event (Admin only)
exports.updateEvent = async (req, res) => {
  try {
    const { 
      title, description, date, time, location, category, price,
      locationType, maxSpots, isFree, isFeatured, instructor 
    } = req.body;
    
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (title) event.title = title;
    if (description) event.description = description;
    if (date) event.date = date;
    if (time) event.time = time;
    if (location) event.location = location;
    if (category) event.category = category;
    if (locationType) event.locationType = locationType;
    if (instructor) event.instructor = instructor;
    
    if (price !== undefined) event.price = Number(price);
    if (maxSpots !== undefined) event.maxSpots = Number(maxSpots);

    if (isFree !== undefined) {
      event.isFree = isFree === 'true' || isFree === true;
      if (event.isFree) event.price = 0;
    }
    
    if (isFeatured !== undefined) {
      event.isFeatured = isFeatured === 'true' || isFeatured === true;
    }

    if (req.file) {
      event.image = `/uploads/${req.file.filename}`;
    }

    const updatedEvent = await event.save();

    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    await logActivity({
      user: isRealAdmin ? undefined : (req.user ? req.user._id : null),
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'EVENT_UPDATE',
      details: `Event updated: ${updatedEvent.title}`,
      targetId: updatedEvent._id
    });

    res.json(updatedEvent);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Delete event (Admin only)
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    
    await Event.findByIdAndDelete(req.params.id);

    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');

    await logActivity({
      user: isRealAdmin ? undefined : (req.user ? req.user._id : null),
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'EVENT_DELETE',
      details: `Event deleted: ${event.title}`,
      targetId: event._id
    });

    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Join/RSVP event
exports.joinEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    const { userId } = req.body;

    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (event.attendees.includes(userId)) {
      // Leave event
      event.attendees = event.attendees.filter(id => id.toString() !== userId);
      
      await logActivity({
        user: userId,
        action: 'EVENT_LEAVE',
        details: `Cancelou participação no evento: ${event.title}`,
        targetId: event._id
      });
    } else {
      // Join event
      event.attendees.push(userId);
      
      await logActivity({
        user: userId,
        action: 'EVENT_JOIN',
        details: `Inscreveu-se no evento: ${event.title}`,
        targetId: event._id
      });
    }

    await event.save();
    res.json(event.attendees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
