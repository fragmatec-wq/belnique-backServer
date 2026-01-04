const ContactMessage = require('../models/ContactMessage');

exports.createMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }

    const newMessage = new ContactMessage({
      name,
      email,
      subject,
      message
    });

    await newMessage.save();
    res.status(201).json({ message: 'Mensagem enviada com sucesso', data: newMessage });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ message: 'Erro ao processar sua mensagem' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar mensagens' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await ContactMessage.findByIdAndUpdate(
      id, 
      { read: true },
      { new: true }
    );
    if (!message) {
      return res.status(404).json({ message: 'Mensagem não encontrada' });
    }
    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar mensagem' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    await ContactMessage.findByIdAndDelete(id);
    res.json({ message: 'Mensagem excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao excluir mensagem' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await ContactMessage.countDocuments({ read: false });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao contar mensagens não lidas' });
  }
};
