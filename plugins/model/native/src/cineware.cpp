// Original read-only bridge. Cineware headers and libraries are external proprietary dependencies.
#include "c4d.h"
#include "c4d_segmenttag.h"
#include "c4d_tangenttag.h"
#include "parameter_ids/object/obase.h"
#include "parameter_ids/material/mmaterial.h"
#include "parameter_ids/object/oboole.h"
#include <cstdlib>
#include <cmath>
#include <cstdint>
#include <vector>
#include <map>
#include <set>
#include <array>
#include <algorithm>
using namespace cineware;

namespace cineware {
void* MemAllocNC(Int n) { return n > 0 && n <= 256 * 1024 * 1024 ? std::malloc(n) : nullptr; }
void* MemAlloc(Int n) { return n > 0 && n <= 256 * 1024 * 1024 ? std::calloc(1, n) : nullptr; }
void* MemRealloc(void* p, Int n) { return n > 0 && n <= 256 * 1024 * 1024 ? std::realloc(p, n) : nullptr; }
void MemFree(void*& p) { std::free(p); p = nullptr; }
Bool BaseDocument::CreateSceneToC4D(Bool) { return false; }
}
void GetWriterInfo(Int32& id, String& name) { id = 0; name = "Ember Peek"; }
RootMaterial* AllocAlienRootMaterial() { return NewObj(RootMaterial); }
RootObject* AllocAlienRootObject() { return NewObj(RootObject); }
RootLayer* AllocAlienRootLayer() { return NewObj(RootLayer); }
RootRenderData* AllocAlienRootRenderData() { return NewObj(RootRenderData); }
RootViewPanel* AllocC4DRootViewPanel() { return NewObj(RootViewPanel); }
LayerObject* AllocAlienLayer() { return NewObj(LayerObject); }
NodeData* AllocAlienObjectData(Int32, Bool& known, BaseList2D*) { known = false; return NewObj(NodeData); }
NodeData* AllocAlienTagData(Int32, Bool& known, BaseList2D*) { known = false; return NewObj(NodeData); }
NodeData* AllocAlienShaderData(Int32, Bool& known, BaseList2D*) { known = false; return NewObj(NodeData); }

using Triangle = bool (*)(void*, const float*);
using Line = bool (*)(void*, const float*);
using Boolean = void (*)(void*, uint32_t, uint32_t, uint32_t, uint32_t);
struct Reader { void* context; Triangle emit; Boolean boolean; Line line; uint32_t nodes = 0, skipped = 0, meshes = 0, triangles = 0, jobs = 0; bool valid = true, counting = false, simplified = false; uint64_t total = 0; };
static bool triangle(Reader& r, const Vector* points, const Matrix& world, const Vector& color, int a, int b, int c, int count) {
    if (a < 0 || b < 0 || c < 0 || a >= count || b >= count || c >= count) return false;
    float xyz[12];
    xyz[9] = static_cast<float>(color.x); xyz[10] = static_cast<float>(color.y); xyz[11] = static_cast<float>(color.z);
    const int indices[3] = {a, b, c};
    for (int i = 0; i < 3; ++i) {
        Vector p = world * points[indices[i]];
        xyz[i * 3] = static_cast<float>(p.x); xyz[i * 3 + 1] = static_cast<float>(p.y); xyz[i * 3 + 2] = static_cast<float>(p.z);
        for (int j = 0; j < 3; ++j) if (!std::isfinite(xyz[i * 3 + j])) return false;
    }
    if (!r.emit(r.context, xyz)) return false;
    ++r.triangles;
    return true;
}
// Vertex clustering keeps adjacent faces connected instead of dropping arbitrary faces.
static void clustered(Reader& r, const Vector* points, int count, const CPolygon* faces, int faceCount, const Matrix& world, const Vector& color) {
    const uint64_t target = 4000000ULL * (static_cast<uint64_t>(faceCount) * 2) / r.total;
    if (!target || !count) return;
    Vector low = points[0], high = points[0];
    for (int i = 0; i < count; ++i) {
        const Vector& p = points[i];
        if (!std::isfinite(p.x) || !std::isfinite(p.y) || !std::isfinite(p.z)) { r.valid = false; return; }
        low.x = std::min(low.x,p.x); low.y = std::min(low.y,p.y); low.z = std::min(low.z,p.z);
        high.x = std::max(high.x,p.x); high.y = std::max(high.y,p.y); high.z = std::max(high.z,p.z);
    }
    const double span = std::max({high.x-low.x,high.y-low.y,high.z-low.z});
    if (!std::isfinite(span) || span <= 0) return;
    std::vector<int> indices(count);
    std::vector<Vector> vertices;
    std::vector<std::array<int,3>> triangles;
    double resolution = std::max(1.0,std::sqrt(static_cast<double>(target)));
    for (int attempt=0; attempt<24; ++attempt) {
        std::map<std::array<int,3>,int> cells;
        vertices.clear(); triangles.clear();
        std::vector<int> weights;
        const double scale = resolution/span;
        for (int i=0; i<count; ++i) {
            const Vector q=(points[i]-low)*scale;
            const std::array<int,3> key={static_cast<int>(q.x),static_cast<int>(q.y),static_cast<int>(q.z)};
            auto found=cells.find(key);
            int id;
            if (found==cells.end()) { id=static_cast<int>(vertices.size()); cells.emplace(key,id); vertices.push_back(points[i]); weights.push_back(1); }
            else { id=found->second; vertices[id]+=points[i]; ++weights[id]; }
            indices[i]=id;
        }
        for (size_t i=0; i<vertices.size(); ++i) vertices[i]/=static_cast<double>(weights[i]);
        std::set<std::array<int,3>> unique;
        auto add=[&](int a,int b,int c) {
            if (a<0 || b<0 || c<0 || a>=count || b>=count || c>=count) { r.valid=false; return; }
            std::array<int,3> t={indices[a],indices[b],indices[c]};
            if(t[0]==t[1] || t[1]==t[2] || t[0]==t[2]) return;
            auto key=t; std::sort(key.begin(),key.end());
            if(unique.insert(key).second) triangles.push_back(t);
        };
        for(int i=0; i<faceCount && r.valid; ++i) {
            const CPolygon& f=faces[i]; add(f.a,f.b,f.c); if(f.c!=f.d)add(f.a,f.c,f.d);
        }
        if (!r.valid) return;
        if(triangles.size()<=target) break;
        resolution*=0.65;
        if(attempt==23) { ++r.skipped; return; }
    }
    for(const auto& t:triangles) {
        if(!triangle(r,vertices.data(),world,color,t[0],t[1],t[2],static_cast<int>(vertices.size()))) { r.valid=false; return; }
    }
}
static void curves(Reader& r, BaseObject* object, const Matrix& world) {
    if(r.counting) return;
    auto* pointObject = static_cast<PointObject*>(object);
    const int count = pointObject->GetPointCount();
    const Vector* points = pointObject->GetPointR();
    if(count < 0 || count > 2000000 || (count && !points)) { r.valid=false; return; }
    auto* spline = object->IsInstanceOf(Ospline) ? static_cast<SplineObject*>(object) : nullptr;
    auto* tag = static_cast<SegmentTag*>(object->GetTag(Tsegment));
    const int segments = spline ? spline->GetSegmentCount() : (tag ? tag->GetCount() : 0);
    const Segment* parts = spline ? spline->GetSegmentR() : (tag ? tag->GetSegment() : nullptr);
    if(segments < 0 || segments > count || (segments && !parts)) { r.valid=false; return; }
    const Tangent* tangents = spline ? spline->GetTangentR() : nullptr;
    const bool bezier = spline && spline->GetSplineType()==SPLINETYPE_BEZIER && tangents && spline->GetTangentCount()==count;
    Vector color(0.55,0.62,0.7);
    for(BaseObject* owner=object;owner;owner=owner->GetUp()) {
        if(owner->GetDataInstanceRef().GetInt32(ID_BASEOBJECT_USECOLOR)==ID_BASEOBJECT_USECOLOR_ALWAYS) {color=owner->GetDataInstanceRef().GetVector(ID_BASEOBJECT_COLOR);break;}
    }
    auto emit=[&](const Vector& a,const Vector& b) {
        Vector x=world*a,y=world*b;
        float values[9]={static_cast<float>(x.x),static_cast<float>(x.y),static_cast<float>(x.z),static_cast<float>(y.x),static_cast<float>(y.y),static_cast<float>(y.z),static_cast<float>(color.x),static_cast<float>(color.y),static_cast<float>(color.z)};
        if(!r.line(r.context,values)) r.valid=false;
    };
    int offset=0;
    for(int part=0;part<std::max(segments,1) && r.valid;++part) {
        const int length=segments?parts[part].cnt:count;
        const bool closed=segments?parts[part].closed:(spline && spline->GetIsClosed());
        if(length<0 || length>count-offset) {r.valid=false;return;}
        for(int i=0;i<length-1+(closed && length>1);++i) {
            int a=offset+i,b=offset+(i+1)%length;
            if(bezier) {
                Vector previous=points[a];
                for(int step=1;step<=12 && r.valid;++step) {
                    double t=step/12.0,u=1-t;
                    Vector next=points[a]*(u*u*u)+(points[a]+tangents[a].vr)*(3*u*u*t)+(points[b]+tangents[b].vl)*(3*u*t*t)+points[b]*(t*t*t);
                    emit(previous,next);previous=next;
                }
            } else emit(points[a],points[b]);
            if(!r.valid) return;
        }
        offset+=length;
    }
    if(count>1) ++r.meshes;
}
static void walk(Reader& r, BaseObject* first, const Matrix& parent, int depth, bool siblings = true) {
    if (depth > 128) { r.valid = false; return; }
    for (BaseObject* o = first; o && r.valid; o = siblings ? o->GetNext() : nullptr) {
        if (++r.nodes > 100000) { r.valid = false; return; }
        if (o->GetDataInstanceRef().GetInt32(ID_BASEOBJECT_VISIBILITY_EDITOR) == MODE_OFF) continue;
        const Matrix world = parent * o->GetMl();
        BaseObject* cache = o->GetDeformCache();
        if (!cache) cache = o->GetCache();
        if (cache) { walk(r, cache, world, depth + 1); continue; }
        // Only small direct polygon differences qualify; all other nodes keep the base path.
        BaseObject* a = o->GetDown();
        BaseObject* b = a ? a->GetNext() : nullptr;
        if (o->GetType() == OBJECT_BOOLE && !r.counting && !r.simplified && r.total <= 3976000 && r.jobs < 4 && o->GetDataInstanceRef().GetInt32(BOOLEOBJECT_TYPE) == BOOLEOBJECT_TYPE_SUBTRACT &&
            o->GetDataInstanceRef().GetBool(ID_BASEOBJECT_GENERATOR_FLAG, true) &&
            a && b && !b->GetNext() && !a->GetDown() && !b->GetDown() && a->IsInstanceOf(Opolygon) && b->IsInstanceOf(Opolygon) &&
            !a->GetCache() && !b->GetCache() && !a->GetDeformCache() && !b->GetDeformCache() &&
            static_cast<PolygonObject*>(a)->GetPolygonCount() > 0 && static_cast<PolygonObject*>(b)->GetPolygonCount() > 0 &&
            static_cast<PolygonObject*>(a)->GetPolygonCount() + static_cast<PolygonObject*>(b)->GetPolygonCount() <= 3000 &&
            a->GetDataInstanceRef().GetInt32(ID_BASEOBJECT_VISIBILITY_EDITOR) != MODE_OFF && b->GetDataInstanceRef().GetInt32(ID_BASEOBJECT_VISIBILITY_EDITOR) != MODE_OFF) {
            const uint32_t start = r.triangles;
            walk(r, a, world, depth + 1, false);
            const uint32_t cutter = r.triangles;
            walk(r, b, world, depth + 1, false);
            if (!r.valid) return;
            r.boolean(r.context, start, cutter - start, cutter, r.triangles - cutter);
            ++r.jobs; ++r.skipped; --r.meshes;
            continue;
        }
        if (o->IsInstanceOf(Opolygon)) {
            auto* mesh = static_cast<PolygonObject*>(o);
            const int count = mesh->GetPointCount(), faces = mesh->GetPolygonCount();
            if (count < 0 || count > 2000000 || faces < 0 || faces > 4000000) { r.valid = false; return; }
            const Vector* points = mesh->GetPointR(); const CPolygon* polygons = mesh->GetPolygonR();
            if ((count && !points) || (faces && !polygons)) { r.valid = false; return; }
            if (faces) ++r.meshes;
            Vector color(0.55, 0.62, 0.7);
            for (BaseObject* owner = o; owner; owner = owner->GetUp()) {
                if (owner->GetDataInstanceRef().GetInt32(ID_BASEOBJECT_USECOLOR) == ID_BASEOBJECT_USECOLOR_ALWAYS) {
                    color = owner->GetDataInstanceRef().GetVector(ID_BASEOBJECT_COLOR); break;
                }
                BaseTag* tag = owner->GetTag(Ttexture);
                if (tag) {
                    auto* material = static_cast<TextureTag*>(tag)->GetMaterial();
                    if (material) { color = material->GetDataInstanceRef().GetVector(MATERIAL_COLOR_COLOR, color); break; }
                }
            }
            if (r.counting) { r.total += static_cast<uint64_t>(faces) * 2; }
            else if(r.simplified) { clustered(r,points,count,polygons,faces,world,color); walk(r,o->GetDown(),world,depth+1); continue; }
            for (int i = 0; !r.counting && i < faces && r.valid; ++i) {
                const CPolygon& f = polygons[i];
                r.valid = triangle(r, points, world, color, f.a, f.b, f.c, count);
                if (r.valid && f.c != f.d) r.valid = triangle(r, points, world, color, f.a, f.c, f.d, count);
            }
        } else if (o->IsInstanceOf(Ospline) || o->GetType() == Oline) {
            curves(r,o,world);
        } else if (o->GetType() != Onull && o->GetType() != Ocamera && o->GetType() != Olight && o->GetType() != Ospline && o->GetType() != Oline) {
            ++r.skipped;
        }
        // With no saved boolean result, show only the base operand for cuts/intersections.
        // Displaying cutter meshes as solid geometry would obscure the identifiable shape.
        const bool allChildren = o->GetType() != OBJECT_BOOLE || o->GetDataInstanceRef().GetInt32(BOOLEOBJECT_TYPE) == BOOLEOBJECT_TYPE_UNION;
        walk(r, o->GetDown(), world, depth + 1, allChildren);
    }
}
extern "C" int ember_c4d_read(const uint16_t* path, void* context, Triangle emit, uint32_t* meshes, uint32_t* skipped, uint32_t* simplified, Line line, Boolean boolean) {
    BaseDocument* doc = nullptr;
    try {
        doc = LoadDocument(Filename(String(path)), SCENEFILTER_OBJECTS);
        if (!doc) return 1;
        Reader count{context, emit, boolean, line};
        count.counting = true;
        walk(count, doc->GetFirstObject(), Matrix(), 0);
        if (!count.valid) { DeleteObj(doc); return 2; }
        Reader r{context, emit, boolean, line};
        r.total = count.total;
        r.simplified = count.total > 4000000;
        *simplified = r.simplified ? 1 : 0;
        walk(r, doc->GetFirstObject(), Matrix(), 0);
        *meshes = r.meshes; *skipped = r.skipped;
        DeleteObj(doc);
        return r.valid ? 0 : 2;
    } catch (...) { if (doc) DeleteObj(doc); return 3; }
}
