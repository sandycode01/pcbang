// In-memory "database" for PCBang
// Data resets whenever the server restarts.

const categories = [
  { id: "cpu", name: "Processors", icon: "cpu" },
  { id: "gpu", name: "Graphics Cards", icon: "gpu" },
  { id: "mobo", name: "Motherboards", icon: "mobo" },
  { id: "ram", name: "Memory (RAM)", icon: "ram" },
  { id: "storage", name: "Storage", icon: "storage" },
  { id: "psu", name: "Power Supplies", icon: "psu" },
  { id: "case", name: "PC Cases", icon: "case" },
  { id: "cooling", name: "Cooling", icon: "cooling" },
  { id: "peripherals", name: "Peripherals", icon: "peripherals" },
  { id: "laptops", name: "Laptops", icon: "laptop" }
];

// Helper to build a product quickly
function p(id, title, category, price, discountPrice, stock, sold, rating, flashSale, specs, image) {
  return {
    id,
    title,
    category,
    price,
    discountPrice: discountPrice || null,
    stock,
    sold,
    rating,
    flashSale: !!flashSale,
    specs,
    image
  };
}

let products = [
  p("p1", "Ryzen 7 7800X3D 8-Core Desktop Processor", "cpu", 21999, 18499, 14, 328, 4.8, true,
    "8 Cores / 16 Threads, AM5 Socket, 4.2GHz Base / 5.0GHz Boost, 96MB Cache", "cpu"),
  p("p2", "Intel Core i5-14600K Desktop Processor", "cpu", 17999, 15999, 22, 501, 4.7, true,
    "14 Cores / 20 Threads, LGA1700 Socket, up to 5.3GHz Turbo", "cpu"),
  p("p3", "Ryzen 5 5600 6-Core Processor", "cpu", 6999, null, 40, 812, 4.6, false,
    "6 Cores / 12 Threads, AM4 Socket, 3.5GHz Base / 4.4GHz Boost", "cpu"),
  p("p4", "Intel Core i9-14900K Desktop Processor", "cpu", 32999, null, 8, 145, 4.9, false,
    "24 Cores / 32 Threads, LGA1700 Socket, up to 6.0GHz Turbo", "cpu"),

  p("p5", "GeForce RTX 4070 Ti Super 16GB Graphics Card", "gpu", 54999, 47999, 6, 210, 4.8, true,
    "16GB GDDR6X, 2610MHz Boost Clock, DisplayPort 2.1, PCIe 4.0", "gpu"),
  p("p6", "Radeon RX 7800 XT 16GB Graphics Card", "gpu", 34999, 29999, 11, 175, 4.7, true,
    "16GB GDDR6, 2430MHz Game Clock, RDNA 3 Architecture", "gpu"),
  p("p7", "GeForce RTX 4060 8GB Graphics Card", "gpu", 18999, 16499, 30, 640, 4.6, true,
    "8GB GDDR6, DLSS 3, Ada Lovelace Architecture, 115W TDP", "gpu"),
  p("p8", "GeForce RTX 4090 24GB Graphics Card", "gpu", 109999, null, 3, 42, 4.9, false,
    "24GB GDDR6X, 2520MHz Boost Clock, Flagship Performance", "gpu"),

  p("p9", "ROG Strix B650-A Gaming WiFi Motherboard", "mobo", 14999, 12999, 15, 98, 4.7, true,
    "AM5 Socket, DDR5, PCIe 5.0, WiFi 6E, ATX Form Factor", "mobo"),
  p("p10", "MSI PRO Z790-P WiFi Motherboard", "mobo", 12499, null, 18, 76, 4.5, false,
    "LGA1700 Socket, DDR5, PCIe 5.0, WiFi 6, ATX Form Factor", "mobo"),
  p("p11", "Gigabyte B550M AORUS Elite Motherboard", "mobo", 6999, 5999, 25, 210, 4.4, true,
    "AM4 Socket, DDR4, PCIe 4.0, Micro-ATX Form Factor", "mobo"),

  p("p12", "Kingston Fury Beast 32GB (2x16GB) DDR5 6000MHz", "ram", 6499, 5499, 45, 390, 4.8, true,
    "32GB Kit (2x16GB), DDR5-6000, CL36, RGB Lighting", "ram"),
  p("p13", "Corsair Vengeance 16GB (2x8GB) DDR4 3200MHz", "ram", 2799, null, 60, 720, 4.6, false,
    "16GB Kit (2x8GB), DDR4-3200, CL16, Low-Profile Heatspreader", "ram"),
  p("p14", "G.Skill Trident Z5 RGB 32GB (2x16GB) DDR5 6400MHz", "ram", 8999, 7499, 20, 155, 4.9, true,
    "32GB Kit (2x16GB), DDR5-6400, CL32, Dynamic RGB", "ram"),

  p("p15", "Samsung 990 Pro 1TB NVMe SSD", "storage", 6999, 5799, 33, 480, 4.9, true,
    "1TB, PCIe 4.0 NVMe M.2, up to 7450MB/s Read", "storage"),
  p("p16", "WD Blue 2TB SATA SSD", "storage", 5499, 4699, 28, 305, 4.6, true,
    "2TB, SATA III 2.5-inch, up to 560MB/s Read", "storage"),
  p("p17", "Seagate Barracuda 4TB HDD", "storage", 4499, null, 50, 610, 4.4, false,
    "4TB, 3.5-inch, 5400RPM, SATA 6Gb/s", "storage"),
  p("p18", "Crucial P3 500GB NVMe SSD", "storage", 2199, 1799, 55, 890, 4.5, true,
    "500GB, PCIe 3.0 NVMe M.2, up to 3500MB/s Read", "storage"),

  p("p19", "Corsair RM850x 850W 80+ Gold PSU", "psu", 8499, 7299, 17, 260, 4.8, true,
    "850W, 80+ Gold Certified, Fully Modular, 10-Year Warranty", "psu"),
  p("p20", "EVGA 600 BR 600W 80+ Bronze PSU", "psu", 3299, null, 35, 410, 4.4, false,
    "600W, 80+ Bronze Certified, Non-Modular", "psu"),
  p("p21", "Seasonic Focus GX-750 750W 80+ Gold PSU", "psu", 7499, 6499, 12, 133, 4.7, true,
    "750W, 80+ Gold Certified, Fully Modular, Compact Size", "psu"),

  p("p22", "NZXT H5 Flow Mid-Tower Case", "case", 5999, 4999, 24, 190, 4.6, true,
    "Mid-Tower ATX, High-Airflow Front Panel, Tempered Glass Side", "case"),
  p("p23", "Lian Li O11 Dynamic EVO Case", "case", 9999, null, 10, 87, 4.9, false,
    "Mid-Tower, Dual Chamber Design, Tempered Glass, Modular Layout", "case"),
  p("p24", "Cooler Master MasterBox Q300L Case", "case", 2999, 2499, 40, 350, 4.3, true,
    "Micro-ATX, Compact Design, Magnetic Dust Filter", "case"),

  p("p25", "NZXT Kraken 240 RGB AIO Liquid Cooler", "cooling", 8999, 7499, 16, 140, 4.7, true,
    "240mm Radiator, RGB Pump Cap, LCD Display, Dual PWM Fans", "cooling"),
  p("p26", "Deepcool AK620 Dual Tower Air Cooler", "cooling", 3499, 2999, 30, 275, 4.8, true,
    "Dual Tower, 6 Heat Pipes, Dual 120mm Fans, 260W TDP Support", "cooling"),
  p("p27", "Arctic P12 120mm Case Fan (3-Pack)", "cooling", 1299, null, 60, 520, 4.5, false,
    "3x120mm PWM Fans, Pressure-Optimized, Low Noise", "cooling"),

  p("p28", "Logitech G Pro X Mechanical Gaming Keyboard", "peripherals", 6999, 5999, 22, 300, 4.7, true,
    "TKL Mechanical, Hot-Swappable Switches, Detachable Cable", "peripherals"),
  p("p29", "Razer DeathAdder V3 Gaming Mouse", "peripherals", 3499, 2999, 45, 610, 4.8, true,
    "30,000 DPI Optical Sensor, Ergonomic Shape, 59g Lightweight", "peripherals"),
  p("p30", "LG UltraGear 27\" 165Hz Gaming Monitor", "peripherals", 14999, 12999, 14, 175, 4.8, true,
    "27-inch QHD IPS, 165Hz Refresh Rate, 1ms Response Time", "peripherals"),
  p("p31", "HyperX Cloud II Gaming Headset", "peripherals", 3999, null, 38, 460, 4.6, false,
    "7.1 Surround Sound, Memory Foam Ear Cushions, Detachable Mic", "peripherals"),

  p("p32", "Dell XPS 15 Laptop", "laptops", 129999, 119999, 8, 85, 4.7, true,
    "15.6-inch 4K OLED, Intel Core i7-13700H, 16GB RAM, 1TB SSD, NVIDIA RTX 4060", "laptops"),
  p("p33", "MacBook Pro 14\" M2 Pro Laptop", "laptops", 149999, 145999, 100, 42, 4.9, false,
    "14-inch Liquid Retina XDR, Apple M2 Pro Chip, 16GB RAM, 512GB SSD", "laptops"),
  p("p34", "ASUS ROG Zephyrus G14 Laptop", "laptops", 89999, 79999, 12, 98, 4.8, true,
    "14-inch QHD IPS, AMD Ryzen 9 7940HS, NVIDIA RTX 4060, 16GB RAM, 1TB SSD", "laptops"),
];

let nextIdCounter = products.length + 1;

function generateId() {
  return "p" + nextIdCounter++;
}

module.exports = {
  categories,
  getProducts: () => products,
  setProducts: (newProducts) => { products = newProducts; },
  generateId
};
