import Header from "@/components/Header";
import ChatSection from "@/components/ChatSection";
import UploadSection from "@/components/UploadSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
          {/* Chat Section - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <ChatSection />
          </div>
          
          {/* Upload Section - Takes 1 column on large screens */}
          <div className="lg:col-span-1">
            <UploadSection />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
