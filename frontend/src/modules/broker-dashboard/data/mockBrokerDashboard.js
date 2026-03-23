const properties = [
  {
    id: "property-1",
    title: "Skyline Crest Residences",
    type: "Apartment",
    status: "ACTIVE",
    price: 18400000,
    locality: "Bodakdev",
    city: "Ahmedabad",
    enquiries: 22,
  },
  {
    id: "property-2",
    title: "Palm Grove Signature Villa",
    type: "Villa",
    status: "ACTIVE",
    price: 32500000,
    locality: "Science City",
    city: "Ahmedabad",
    enquiries: 31,
  },
  {
    id: "property-3",
    title: "Riverfront Executive Suites",
    type: "Commercial",
    status: "ACTIVE",
    price: 185000,
    locality: "Ashram Road",
    city: "Ahmedabad",
    enquiries: 17,
  },
  {
    id: "property-4",
    title: "Lakeview Terrace 3BHK",
    type: "Apartment",
    status: "SOLD",
    price: 13800000,
    locality: "Vastrapur",
    city: "Ahmedabad",
    enquiries: 19,
  },
  {
    id: "property-5",
    title: "Aurora Corporate Tower",
    type: "Office",
    status: "ACTIVE",
    price: 228000,
    locality: "SG Highway",
    city: "Ahmedabad",
    enquiries: 14,
  },
];

const enquiries = [
  {
    id: "enquiry-1",
    guestName: "Riya Mehta",
    propertyName: "Skyline Crest Residences",
    message: "Please share the floor plan and society details.",
    status: "UNREAD",
    time: "8 min ago",
  },
  {
    id: "enquiry-2",
    guestName: "Nirav Desai",
    propertyName: "Palm Grove Signature Villa",
    message: "Can we schedule a site visit this weekend?",
    status: "UNREAD",
    time: "22 min ago",
  },
  {
    id: "enquiry-3",
    guestName: "Aanya Shah",
    propertyName: "Riverfront Executive Suites",
    message: "Need parking and lease details for this property.",
    status: "READ",
    time: "43 min ago",
  },
  {
    id: "enquiry-4",
    guestName: "Priyanka Soni",
    propertyName: "Aurora Corporate Tower",
    message: "Please confirm maintenance charges and final rent.",
    status: "UNREAD",
    time: "2 hrs ago",
  },
];

const notifications = [
  {
    id: "notification-1",
    title: "New enquiry received",
    message: "Skyline Crest Residences received a fresh buyer enquiry.",
    status: "UNREAD",
    time: "5 min ago",
    category: "lead",
  },
  {
    id: "notification-2",
    title: "Plan usage updated",
    message: "You have used 12 of 50 active listing slots.",
    status: "UNREAD",
    time: "3 hrs ago",
    category: "subscription",
  },
  {
    id: "notification-3",
    title: "Listing marked sold",
    message: "Lakeview Terrace 3BHK was updated to sold status.",
    status: "READ",
    time: "Today",
    category: "listing",
  },
];

const subscription = {
  currentPlan: "Premium Growth",
  propertiesUsed: 12,
  propertiesLimit: 50,
  expiryDate: "30 Sep 2026",
  features: [
    "50 live property slots",
    "Advanced enquiry routing",
    "Priority support",
  ],
};

const activeListings = properties.filter((property) => property.status === "ACTIVE").length;

export const mockBrokerDashboard = {
  stats: {
    activeListings,
  },
  properties,
  enquiries,
  notifications,
  subscription,
};
